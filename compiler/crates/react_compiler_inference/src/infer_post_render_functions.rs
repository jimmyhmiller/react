/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

//! Finds the functions of a component or hook that run after render, for state
//! variables (`compiler/docs/experiments/0007-state-variables.md`).
//!
//! A function runs after render when React, not the render, calls it: it is
//! passed where a frozen value is expected (a JSX prop, a hook argument), it is
//! returned from the component or hook, or it is reachable from such a value.
//! This is the condition that `ValidateLocalsNotReassignedAfterRender` rejects
//! a reassignment under, computed for every function instead of for the first
//! reassignment, and requires the operand effects of
//! `InferMutationAliasingRanges`.
//!
//! Each function value is followed through the identifiers it flows to:
//!
//! - **directly**, while an identifier holds the function itself or a value
//!   that contains it (a variable, an object or array, a function that
//!   captures it, the result of calling a function that returns it);
//! - **derived**, once it has been passed to a call: the result of
//!   `items.map(callback)` depends on `callback`, but is not `callback`.
//!
//! A function that is frozen directly runs after render. A function that is
//! only frozen through a derived value (the `.map` callback whose result is
//! rendered) is most likely called during render, but the compiler cannot
//! prove it.
//!
//! The analysis also reports what only type inference knows:
//!
//! - the method calls of nested functions that mutate their receiver
//!   (`todos.push(todo)` where `todos` is an array), and the ones that may:
//!   the compiler knows nothing about the method (`todos.splice(0, 1)`, which
//!   has no signature, or any method of a value of unknown type);
//! - the variables that hold a ref, which is mutable by design and never
//!   state.

use rustc_hash::{FxHashMap, FxHashSet};

use react_compiler_hir::environment::Environment;
use react_compiler_hir::visitors::{
    each_instruction_lvalue_ids, each_instruction_value_operand, each_terminal_operand,
};
use react_compiler_hir::{
    AliasingEffect, Effect, FunctionId, HirFunction, IdentifierId, InstructionId, InstructionValue,
    Place, Terminal,
};
use react_compiler_optimization::state_variables::{MethodMutation, PostRenderFunctions};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct Flow {
    function: FunctionId,
    direct: bool,
}

#[derive(Default)]
struct State {
    /// The functions that each identifier may hold or depend on.
    values: FxHashMap<IdentifierId, FxHashSet<Flow>>,
    /// The functions that a call of each function may return.
    returns: FxHashMap<FunctionId, FxHashSet<Flow>>,
    direct: FxHashSet<FunctionId>,
    derived: FxHashSet<FunctionId>,
    changed: bool,
}

/// The method calls of the functions nested in `func`, at any depth, that
/// mutate their receiver or may.
fn mutating_method_calls(
    func: &HirFunction,
    function: Option<FunctionId>,
    env: &Environment,
    out: &mut FxHashMap<
        (FunctionId, InstructionId),
        (MethodMutation, Option<react_compiler_hir::SourceLocation>),
    >,
) {
    for block in func.body.blocks.values() {
        for instr_id in &block.instructions {
            let instr = &func.instructions[instr_id.0 as usize];
            match &instr.value {
                InstructionValue::FunctionExpression { lowered_func, .. }
                | InstructionValue::ObjectMethod { lowered_func, .. } => {
                    mutating_method_calls(
                        &env.functions[lowered_func.func.0 as usize],
                        Some(lowered_func.func),
                        env,
                        out,
                    );
                }
                InstructionValue::MethodCall {
                    receiver,
                    property,
                    loc,
                    ..
                } => {
                    let Some(function) = function else { continue };
                    let effects = || instr.effects.iter().flatten();
                    let mutates = effects().any(|effect| {
                        matches!(
                            effect,
                            AliasingEffect::Mutate { value, .. }
                            | AliasingEffect::MutateTransitive { value, .. }
                                if value.identifier == receiver.identifier
                        )
                    });
                    let may_mutate = effects().any(|effect| {
                        matches!(
                            effect,
                            AliasingEffect::MutateConditionally { value, .. }
                            | AliasingEffect::MutateTransitiveConditionally { value, .. }
                                if value.identifier == receiver.identifier
                        )
                    });
                    // A method with a signature that does not mutate its
                    // receiver (`forEach`) may still mutate it conditionally,
                    // through its callback. That is not an update of the
                    // receiver.
                    let property_type = &env.types
                        [env.identifiers[property.identifier.0 as usize].type_.0 as usize];
                    let has_signature =
                        matches!(env.get_function_signature(property_type), Ok(Some(_)));
                    if mutates {
                        out.insert((function, *instr_id), (MethodMutation::Known, *loc));
                    } else if may_mutate
                        && !has_signature
                        && !is_read_only_collection_method(func, env, property.identifier)
                    {
                        out.insert((function, *instr_id), (MethodMutation::Unknown, *loc));
                    }
                }
                _ => {}
            }
        }
    }
}

/// Whether `property` is loaded by a name that every built-in collection that
/// has such a method declares not to mutate its receiver (`forEach`, `map`,
/// `has`). When the type of the receiver is unknown, this is what the method
/// most likely is.
fn is_read_only_collection_method(
    func: &HirFunction,
    env: &Environment,
    property: IdentifierId,
) -> bool {
    use react_compiler_hir::object_shape::{BUILT_IN_ARRAY_ID, BUILT_IN_MAP_ID, BUILT_IN_SET_ID};

    let name = func
        .instructions
        .iter()
        .find_map(|instr| match &instr.value {
            InstructionValue::PropertyLoad {
                property: react_compiler_hir::PropertyLiteral::String(name),
                ..
            } if instr.lvalue.identifier == property => Some(name.as_str()),
            _ => None,
        });
    let Some(name) = name else {
        return false;
    };
    let mut declared = false;
    for shape_id in [BUILT_IN_ARRAY_ID, BUILT_IN_MAP_ID, BUILT_IN_SET_ID] {
        let Some(method) = env
            .shapes()
            .get(shape_id)
            .and_then(|shape| shape.properties.get(name))
        else {
            continue;
        };
        let Ok(Some(signature)) = env.get_function_signature(method) else {
            continue;
        };
        if matches!(signature.callee_effect, Effect::Store | Effect::Mutate) {
            return false;
        }
        declared = true;
    }
    declared
}

impl State {
    fn flows(&self, identifier: IdentifierId) -> Vec<Flow> {
        self.values
            .get(&identifier)
            .map(|flows| flows.iter().copied().collect())
            .unwrap_or_default()
    }

    fn add(&mut self, identifier: IdentifierId, flows: impl IntoIterator<Item = Flow>) {
        let entry = self.values.entry(identifier).or_default();
        for flow in flows {
            if entry.insert(flow) {
                self.changed = true;
            }
        }
    }

    fn add_returns(&mut self, function: FunctionId, flows: impl IntoIterator<Item = Flow>) {
        let entry = self.returns.entry(function).or_default();
        for flow in flows {
            if entry.insert(flow) {
                self.changed = true;
            }
        }
    }

    fn escape(&mut self, flows: impl IntoIterator<Item = Flow>) {
        for flow in flows {
            let set = if flow.direct {
                &mut self.direct
            } else {
                &mut self.derived
            };
            if set.insert(flow.function) {
                self.changed = true;
            }
        }
    }
}

/// Requires operand effects (`InferMutationAliasingRanges`).
pub fn infer_post_render_functions(func: &HirFunction, env: &Environment) -> PostRenderFunctions {
    let mut state = State::default();
    loop {
        state.changed = false;
        visit_function(func, None, env, &mut state);
        if !state.changed {
            break;
        }
    }
    let locs = env
        .functions
        .iter()
        .enumerate()
        .map(|(index, function)| (FunctionId(index as u32), function.loc.clone()))
        .collect();
    let mut mutating_calls = FxHashMap::default();
    mutating_method_calls(func, None, env, &mut mutating_calls);
    let refs = env
        .identifiers
        .iter()
        .filter(|identifier| {
            react_compiler_hir::is_ref_or_ref_like_mutable_type(
                &env.types[identifier.type_.0 as usize],
            )
        })
        .map(|identifier| identifier.declaration_id)
        .collect();
    PostRenderFunctions {
        direct: state.direct,
        derived: state.derived,
        locs,
        mutating_calls,
        refs,
    }
}

/// `function` is `None` for the component or hook itself.
fn visit_function(
    func: &HirFunction,
    function: Option<FunctionId>,
    env: &Environment,
    state: &mut State,
) {
    for block in func.body.blocks.values() {
        for phi in &block.phis {
            let flows: Vec<Flow> = phi
                .operands
                .values()
                .flat_map(|operand| state.flows(operand.identifier))
                .collect();
            state.add(phi.place.identifier, flows);
        }

        for instr_id in &block.instructions {
            let instr = &func.instructions[instr_id.0 as usize];
            match &instr.value {
                InstructionValue::FunctionExpression { lowered_func, .. }
                | InstructionValue::ObjectMethod { lowered_func, .. } => {
                    let inner_id = lowered_func.func;
                    let inner = &env.functions[inner_id.0 as usize];
                    visit_function(inner, Some(inner_id), env, state);

                    let own = Flow {
                        function: inner_id,
                        direct: true,
                    };
                    // A function that captures another can call it.
                    let mut flows: Vec<Flow> = inner
                        .context
                        .iter()
                        .flat_map(|place| state.flows(place.identifier))
                        .collect();
                    flows.push(own);
                    // The body of an async function continues after the render
                    // that called it.
                    if inner.is_async {
                        state.escape([own]);
                    }
                    state.add(instr.lvalue.identifier, flows);
                }

                InstructionValue::LoadLocal { place, .. }
                | InstructionValue::LoadContext { place, .. } => {
                    let flows = state.flows(place.identifier);
                    state.add(instr.lvalue.identifier, flows);
                }

                InstructionValue::StoreLocal { lvalue, value, .. }
                | InstructionValue::StoreContext { lvalue, value, .. } => {
                    let flows = state.flows(value.identifier);
                    state.add(lvalue.place.identifier, flows.clone());
                    state.add(instr.lvalue.identifier, flows);
                }

                value => {
                    let (operands, is_call, callee) = call_operands(value, env);
                    let mut result: Vec<Flow> = Vec::new();
                    for operand in &operands {
                        let flows = state.flows(operand.identifier);
                        if flows.is_empty() {
                            continue;
                        }
                        if operand.effect == Effect::Freeze {
                            state.escape(flows);
                        } else if is_call {
                            result.extend(flows.into_iter().map(|flow| Flow {
                                function: flow.function,
                                direct: false,
                            }));
                        } else {
                            result.extend(flows);
                        }
                    }
                    // Calling a function returns what that function returns.
                    if let Some(callee) = callee {
                        for flow in state.flows(callee.identifier) {
                            if flow.direct {
                                if let Some(returned) = state.returns.get(&flow.function) {
                                    result.extend(returned.iter().copied());
                                }
                            }
                        }
                    }
                    if !result.is_empty() {
                        for lvalue in each_instruction_lvalue_ids(instr) {
                            state.add(lvalue, result.iter().copied());
                        }
                    }
                }
            }
        }

        if let Terminal::Return { .. } | Terminal::Throw { .. } = &block.terminal {
            for operand in each_terminal_operand(&block.terminal) {
                let flows = state.flows(operand.identifier);
                match function {
                    Some(function) => state.add_returns(function, flows),
                    // What a component or hook returns is used after render.
                    None => state.escape(flows),
                }
            }
        }
    }
}

/// The operands of an instruction that a function value can flow through,
/// whether the instruction is a call, and the callee of a plain call.
///
/// As in `ValidateLocalsNotReassignedAfterRender`, the arguments of a call
/// whose signature is `noAlias` do not flow into its result.
fn call_operands<'a>(
    value: &'a InstructionValue,
    env: &Environment,
) -> (Vec<Place>, bool, Option<&'a Place>) {
    match value {
        InstructionValue::CallExpression { callee, .. } => {
            let operands = if env.has_no_alias_signature(callee.identifier) {
                vec![callee.clone()]
            } else {
                each_instruction_value_operand(value, env)
            };
            (operands, true, Some(callee))
        }
        InstructionValue::MethodCall {
            receiver, property, ..
        } => {
            let operands = if env.has_no_alias_signature(property.identifier) {
                vec![receiver.clone(), property.clone()]
            } else {
                each_instruction_value_operand(value, env)
            };
            (operands, true, None)
        }
        InstructionValue::TaggedTemplateExpression { tag, .. } => {
            let operands = if env.has_no_alias_signature(tag.identifier) {
                vec![tag.clone()]
            } else {
                each_instruction_value_operand(value, env)
            };
            (operands, true, None)
        }
        InstructionValue::NewExpression { .. } => {
            (each_instruction_value_operand(value, env), true, None)
        }
        _ => (each_instruction_value_operand(value, env), false, None),
    }
}
