/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

//! State variables (`compiler/docs/experiments/0007-state-variables.md`).
//!
//! A `let` of a component or hook that a function reassigns after render is
//! state. This pass rewrites such a variable into ordinary React state, before
//! any inference runs, so that the rest of the compiler sees a component that
//! calls `useState`:
//!
//! ```js
//! let count = 0;                        const [count, setCount] = useState(0);
//! <button onClick={() => count++} />    <button onClick={() => setCount(count => count + 1)} />
//! ```
//!
//! Which functions run after render is decided by
//! `react_compiler_inference::infer_post_render_functions`, on a second lowering
//! of the same function that has been run through `InferMutationAliasingRanges`
//! (the rewrite changes what is reactive, so it cannot run that late itself).
//! Lowering is deterministic, so the `FunctionId`s of that analysis identify the
//! same function expressions here; their source locations are compared to make
//! sure.
//!
//! ## Writes
//!
//! The *root* of a write is the outermost function around it that runs after
//! render. A write whose value is computed from the variable by pure operators
//! in the same block (`count + 1`, `[...todos, todo]`, `!on`) becomes an
//! updater function, `setCount(count => count + 1)`: the operators are moved
//! into the updater and everything else they use is captured, so that
//! consecutive updates compose and the function that writes does not depend on
//! the value. Any other write passes the value, `setCount(value)`.
//!
//! ## Reads
//!
//! A read is the value of the render that created the function, except for a
//! read that may follow a write in the same root (`count++; log(count)`). A root
//! with such a read gets a *shadow*: a local initialized from the state, which
//! the functions of the root read and write instead, as plain JavaScript would.
//! Writes to the shadow also call the setter.

use indexmap::IndexMap;
use rustc_hash::{FxBuildHasher, FxHashMap, FxHashSet};

use react_compiler_diagnostics::{
    CompilerDiagnostic, CompilerDiagnosticDetail, CompilerError, ErrorCategory, SourceLocation,
};
use react_compiler_hir::dominator::compute_unconditional_blocks;
use react_compiler_hir::environment::Environment;
use react_compiler_hir::visitors;
use react_compiler_hir::{
    ArrayPattern, ArrayPatternElement, BasicBlock, BlockId, BlockKind, DeclarationId,
    EvaluationOrder, FunctionExpressionType, FunctionId, HIR, HirFunction, IdentifierId,
    IdentifierName, Instruction, InstructionId, InstructionKind, InstructionValue, LValue,
    LValuePattern, LoweredFunction, NonLocalBinding, ParamPattern, Pattern, Place, PlaceOrSpread,
    PropertyLiteral, ReactFunctionType, ReturnVariant, Terminal,
};
use react_compiler_lowering::{create_temporary_place, mark_instruction_ids, mark_predecessors};
use react_compiler_ssa::enter_ssa::placeholder_function;

/// The functions of a component or hook that run after render, from
/// `react_compiler_inference::infer_post_render_functions`.
#[derive(Debug, Default)]
pub struct PostRenderFunctions {
    /// The function itself is used after render (frozen, returned, async).
    pub direct: FxHashSet<FunctionId>,
    /// Only a value computed from the function is used after render.
    pub derived: FxHashSet<FunctionId>,
    /// The location of every function, to check that the analysis describes
    /// the same function expressions as the function being rewritten.
    pub locs: FxHashMap<FunctionId, Option<SourceLocation>>,
    /// The method calls of nested functions that mutate their receiver or
    /// may, by function and instruction, with their location (checked like
    /// `locs`).
    pub mutating_calls:
        FxHashMap<(FunctionId, InstructionId), (MethodMutation, Option<SourceLocation>)>,
    /// The variables that hold a ref.
    pub refs: FxHashSet<DeclarationId>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MethodMutation {
    /// The signature of the method mutates its receiver (`todos.push(todo)`
    /// where `todos` is an array).
    Known,
    /// The compiler knows nothing about the method. Such a call is a mutation
    /// if nothing uses its result: it can only have been made for its effect on
    /// the receiver.
    Unknown,
}

pub trait StateVariableImports {
    /// The binding of `useState` from `react`.
    fn use_state(&mut self) -> NonLocalBinding;
    /// The binding of `unstable_copyForUpdate` from the compiler runtime.
    fn copy_for_update(&mut self) -> NonLocalBinding;
    /// The binding of `unstable_freezeState` from the compiler runtime.
    fn freeze_state(&mut self) -> NonLocalBinding;
}

/// The function being compiled, or a function expression nested in it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum FnRef {
    Outer,
    Inner(FunctionId),
}

#[derive(Debug, Clone)]
struct Declaration {
    block: BlockId,
    instr: InstructionId,
    loc: Option<SourceLocation>,
}

/// An update of a variable by a nested function: an assignment
/// (`StoreContext`), or a mutation of its value in place.
#[derive(Debug, Clone)]
struct WriteSite {
    variable: IdentifierId,
    function: FnRef,
    instr: InstructionId,
    loc: Option<SourceLocation>,
    mutation: Option<Mutation>,
}

/// A step from a value to one of its properties.
#[derive(Debug, Clone)]
enum PathElement {
    Property(PropertyLiteral),
    Computed(Place),
}

#[derive(Debug, Clone)]
enum MutationOp {
    PropertyStore {
        property: PropertyLiteral,
        value: Place,
    },
    ComputedStore {
        property: Place,
        value: Place,
    },
    PropertyDelete {
        property: PropertyLiteral,
    },
    ComputedDelete {
        property: Place,
    },
    MethodCall {
        method: PropertyLiteral,
        args: Vec<PlaceOrSpread>,
    },
}

/// `todos[i].done = true`: the operation (`.done = true`) on the value at a
/// static path (`[i]`) of a variable (`todos`).
#[derive(Debug, Clone)]
struct Mutation {
    path: Vec<PathElement>,
    op: MutationOp,
    /// The instructions that load the path and, for a method call, the method.
    loads: Vec<InstructionId>,
    /// The aliases that the path was resolved through.
    aliases: Vec<Alias>,
    /// The mutation is part of an optional chain (`user?.tags.push(tag)`).
    in_optional_chain: bool,
    /// The lengths of the prefixes of the path whose value the chain tests:
    /// `[0]` for `user?.tags.push(tag)`, which does nothing unless `user` has a
    /// value.
    guards: Vec<usize>,
    /// `todos.push?.(todo)`: the chain tests the method, not a value of the
    /// state.
    optional_call: bool,
}

/// `const todo = todos[i]`: a variable that holds the value at a path of a
/// candidate. The variable holds an object, the path names a place: they only
/// stay the same thing while nothing puts another object in that place.
#[derive(Debug, Clone)]
struct Alias {
    variable: IdentifierId,
    /// The `StoreLocal` that declares the variable.
    declaration: InstructionId,
    path: Vec<PathElement>,
    /// The instruction that loads the candidate.
    root_load: InstructionId,
}

/// An alias declared by a nested function, and the candidate it is a path of.
#[derive(Debug, Clone)]
struct DeclaredAlias {
    function: FunctionId,
    candidate: IdentifierId,
    alias: Alias,
}

#[derive(Default)]
struct Collected {
    /// The variables declared with `let` by the function being compiled, in
    /// declaration order. A `const` is never state: its value may well be
    /// modified after render, but that is as likely to be an object that is
    /// meant to be (what a hook returned, a class instance) as state.
    candidates: IndexMap<IdentifierId, Declaration, FxBuildHasher>,
    /// Context variables referenced before their declaration.
    hoisted: FxHashSet<IdentifierId>,
    parents: FxHashMap<FunctionId, FnRef>,
    /// Nested functions, outer functions first.
    functions: Vec<FunctionId>,
    writes: Vec<WriteSite>,
    aliases: Vec<DeclaredAlias>,
    /// Instructions other than `StoreContext` that assign a variable.
    other_assignments: Vec<(IdentifierId, Option<SourceLocation>)>,
    globals: FxHashSet<String>,
}

/// Whether a nested function reassigns a variable of `func`, or may mutate its
/// value: the only functions that can have state variables. Cheap, so that the
/// analysis (a second lowering and inference) only runs for them. Every method
/// call on the value of a variable counts, since only the analysis knows which
/// methods mutate.
pub fn has_state_variable_candidates(func: &HirFunction, env: &Environment) -> bool {
    let Ok(collected) = collect(func, env, None) else {
        // Let the rewrite report the error.
        return true;
    };
    collected.writes.iter().any(|write| {
        write.function != FnRef::Outer && collected.candidates.contains_key(&write.variable)
    })
}

/// Rewrites the state variables of `func`. Returns how many there are.
pub fn lower_state_variables(
    func: &mut HirFunction,
    env: &mut Environment,
    post_render: &PostRenderFunctions,
    imports: &mut impl StateVariableImports,
) -> Result<usize, CompilerError> {
    let collected = collect(func, env, Some(post_render))?;

    for function in &collected.functions {
        let loc = &env.functions[function.0 as usize].loc;
        if post_render.locs.get(function) != Some(loc) {
            return Err(invariant(
                "The analysis of state variables describes a different function",
                *loc,
            ));
        }
    }

    // The root of each write: the outermost function around it that runs after
    // render.
    let root_of = |function: FnRef| -> Option<FunctionId> {
        chain(&collected.parents, function)
            .into_iter()
            .find(|function| post_render.direct.contains(function))
    };
    let mut state_variables: Vec<IdentifierId> = Vec::new();
    for variable in collected.candidates.keys() {
        let is_state = collected
            .writes
            .iter()
            .any(|write| write.variable == *variable && root_of(write.function).is_some());
        if is_state {
            state_variables.push(*variable);
        }
    }
    if state_variables.is_empty() {
        return Ok(0);
    }

    // Reading an alias again changes the instructions of the nested functions,
    // but neither the functions nor the writes that make a variable state.
    let reassigned = reassigned_identifiers(func, env);
    let collected = if reload_stale_aliases(env, &collected, &state_variables, reassigned)? {
        collect(func, env, Some(post_render))?
    } else {
        collected
    };
    let root_of = |function: FnRef| -> Option<FunctionId> {
        chain(&collected.parents, function)
            .into_iter()
            .find(|function| post_render.direct.contains(function))
    };

    validate(
        func,
        env,
        &collected,
        &state_variables,
        post_render,
        &root_of,
    )?;

    // Names that the generated setters and shadows must not shadow.
    env.seed_uid_known_names(&collected.globals);
    let mut bindings = Bindings {
        reassigned: reassigned_identifiers(func, env),
        state_variables: state_variables.iter().copied().collect(),
        shadowed: FxHashSet::default(),
    };

    let mut setters: FxHashMap<IdentifierId, Place> = FxHashMap::default();
    for variable in &state_variables {
        let setter = declare_state(
            func,
            env,
            &collected.candidates[variable],
            *variable,
            imports,
        );
        setters.insert(*variable, setter);
    }

    // The roots, each with the functions nested in it, and the state
    // variables that they write.
    let mut roots: IndexMap<FunctionId, (Vec<FunctionId>, Vec<IdentifierId>), FxBuildHasher> =
        IndexMap::default();
    for write in &collected.writes {
        if !state_variables.contains(&write.variable) {
            continue;
        }
        let root = root_of(write.function).expect("validated: every write has a root");
        let entry = roots.entry(root).or_insert_with(|| {
            let tree = collected
                .functions
                .iter()
                .copied()
                .filter(|function| {
                    chain(&collected.parents, FnRef::Inner(*function)).contains(&root)
                })
                .collect();
            (tree, Vec::new())
        });
        if !entry.1.contains(&write.variable) {
            entry.1.push(write.variable);
        }
    }

    // React ignores what an event handler of a host element returns, so the
    // value of `() => count++` is not a read of `count`.
    for root in host_event_handlers(func, env) {
        if roots.contains_key(&root) {
            let mut handler =
                std::mem::replace(&mut env.functions[root.0 as usize], placeholder_function());
            discard_implicit_return(&mut handler, env);
            env.functions[root.0 as usize] = handler;
        }
    }

    // Decide every shadow before rewriting anything: whether an updater can
    // capture the value of another state variable depends on whether that
    // variable has a shadow in the same root, and whether a variable needs a
    // shadow depends on what its updaters can capture. A shadow never makes
    // another one unnecessary, so this reaches a fixed point.
    let mut planned: Vec<(FunctionId, IdentifierId, Option<Shadow>)> = Vec::new();
    for (root, (tree, variables)) in &roots {
        bindings.shadowed.clear();
        loop {
            let mut changed = false;
            for variable in variables {
                if !bindings.shadowed.contains(variable)
                    && needs_shadow(env, *variable, *root, tree, &collected.writes, &bindings)
                {
                    bindings.shadowed.insert(*variable);
                    changed = true;
                }
            }
            if !changed {
                break;
            }
        }
        for variable in variables {
            let shadow = bindings
                .shadowed
                .contains(variable)
                .then(|| create_shadow(env, *variable, *root, tree));
            planned.push((*root, *variable, shadow));
        }
    }

    let mutates_state = collected
        .writes
        .iter()
        .any(|write| write.mutation.is_some() && state_variables.contains(&write.variable));
    let copy = mutates_state.then(|| imports.copy_for_update());

    // Shadows, and the function that declares each.
    let mut shadows: FxHashMap<IdentifierId, FunctionId> = FxHashMap::default();
    for (root, (tree, _)) in &roots {
        bindings.shadowed = planned
            .iter()
            .filter(|(planned_root, _, shadow)| planned_root == root && shadow.is_some())
            .map(|(_, variable, _)| *variable)
            .collect();
        for (planned_root, variable, shadow) in &planned {
            if planned_root != root {
                continue;
            }
            if let Some(shadow) = shadow {
                shadows.insert(shadow.place.identifier, *root);
                bindings.reassigned.insert(shadow.place.identifier);
            }
            for function in tree {
                let mut nested = std::mem::replace(
                    &mut env.functions[function.0 as usize],
                    placeholder_function(),
                );
                let result = rewrite_function(
                    &mut nested,
                    env,
                    *variable,
                    &setters[variable],
                    shadow.as_ref(),
                    function == root,
                    FnRef::Inner(*function),
                    &collected.writes,
                    &bindings,
                    copy.as_ref(),
                );
                env.functions[function.0 as usize] = nested;
                result?;
            }
        }
    }

    // Every other read is the value of the render.
    let state_set: FxHashSet<IdentifierId> = state_variables.iter().copied().collect();
    load_state_as_local(func, &state_set);
    for function in &collected.functions {
        load_state_as_local(&mut env.functions[function.0 as usize], &state_set);
    }

    let mut tracked: FxHashSet<IdentifierId> = state_set;
    tracked.extend(setters.values().map(|place| place.identifier));
    tracked.extend(shadows.keys().copied());
    fix_contexts(func, env, &tracked, &shadows);

    mark_instruction_ids(&mut func.body, &mut func.instructions);
    for index in 0..env.functions.len() {
        let function = &mut env.functions[index];
        mark_instruction_ids(&mut function.body, &mut function.instructions);
    }

    Ok(state_variables.len())
}

// =============================================================================
// Collection
// =============================================================================

fn function<'a>(outer: &'a HirFunction, env: &'a Environment, function: FnRef) -> &'a HirFunction {
    match function {
        FnRef::Outer => outer,
        FnRef::Inner(id) => &env.functions[id.0 as usize],
    }
}

/// The nested functions around `function`, outermost first, including
/// `function` itself.
fn chain(parents: &FxHashMap<FunctionId, FnRef>, function: FnRef) -> Vec<FunctionId> {
    let mut result = Vec::new();
    let mut current = function;
    while let FnRef::Inner(id) = current {
        result.push(id);
        current = parents[&id];
    }
    result.reverse();
    result
}

/// `post_render` tells which method calls mutate their receiver. Without it
/// every method call is assumed to (see `has_state_variable_candidates`), and
/// the result is always `Ok`.
fn collect(
    outer: &HirFunction,
    env: &Environment,
    post_render: Option<&PostRenderFunctions>,
) -> Result<Collected, CompilerError> {
    let mut collected = Collected::default();
    collect_function(outer, env, FnRef::Outer, &mut collected);
    if let Some(post_render) = post_render {
        // A ref is modified after render by design.
        collected.candidates.retain(|variable, _| {
            !post_render
                .refs
                .contains(&env.identifiers[variable.0 as usize].declaration_id)
        });
    }
    let reassigned = reassigned_identifiers(outer, env);
    for function in collected.functions.clone() {
        collect_mutations(env, function, post_render, &reassigned, &mut collected)?;
    }
    Ok(collected)
}

fn collect_function(outer: &HirFunction, env: &Environment, current: FnRef, out: &mut Collected) {
    let func = function(outer, env, current);
    for (block_id, block) in &func.body.blocks {
        for instr_id in &block.instructions {
            let instr = &func.instructions[instr_id.0 as usize];
            let declaration = Declaration {
                block: *block_id,
                instr: *instr_id,
                loc: instr.value.loc().copied(),
            };
            let is_outer = current == FnRef::Outer;
            match &instr.value {
                InstructionValue::FunctionExpression { lowered_func, .. }
                | InstructionValue::ObjectMethod { lowered_func, .. } => {
                    out.parents.insert(lowered_func.func, current);
                    out.functions.push(lowered_func.func);
                    collect_function(outer, env, FnRef::Inner(lowered_func.func), out);
                }
                InstructionValue::DeclareContext { lvalue, .. } => match lvalue.kind {
                    InstructionKind::Let if is_outer => {
                        out.candidates.insert(lvalue.place.identifier, declaration);
                    }
                    InstructionKind::HoistedLet => {
                        out.hoisted.insert(lvalue.place.identifier);
                    }
                    _ => {}
                },
                InstructionValue::DeclareLocal { lvalue, .. } => {
                    if is_outer && lvalue.kind == InstructionKind::Let {
                        out.candidates.insert(lvalue.place.identifier, declaration);
                    }
                }
                InstructionValue::StoreContext { lvalue, loc, .. }
                | InstructionValue::StoreLocal { lvalue, loc, .. } => match lvalue.kind {
                    InstructionKind::Let => {
                        let is_variable = matches!(
                            env.identifiers[lvalue.place.identifier.0 as usize].name,
                            Some(IdentifierName::Named(_))
                        );
                        if is_outer && is_variable {
                            out.candidates.insert(lvalue.place.identifier, declaration);
                        }
                    }
                    InstructionKind::Reassign => out.writes.push(WriteSite {
                        variable: lvalue.place.identifier,
                        function: current,
                        instr: *instr_id,
                        loc: *loc,
                        mutation: None,
                    }),
                    _ => {}
                },
                InstructionValue::LoadGlobal { binding, .. } => {
                    out.globals.insert(binding.name().to_string());
                }
                value => {
                    for place in visitors::each_instruction_value_lvalue(value) {
                        out.other_assignments
                            .push((place.identifier, value.loc().copied()));
                    }
                }
            }
        }
    }
}

/// Finds the mutations by `function` of the value of a candidate: a store, a
/// delete or a mutating method call whose target is a static path of the
/// candidate. A mutation of anything else is not found, and is reported by
/// the compiler as the mutation of a frozen value if it reaches state.
fn collect_mutations(
    env: &Environment,
    function: FunctionId,
    post_render: Option<&PostRenderFunctions>,
    reassigned: &FxHashSet<IdentifierId>,
    out: &mut Collected,
) -> Result<(), CompilerError> {
    let func = &env.functions[function.0 as usize];
    let definitions = definitions(func);
    let candidates: FxHashSet<IdentifierId> = out.candidates.keys().copied().collect();
    // The variables of `func` that always hold the value they are declared
    // with: `const todo = todos[i]`.
    let mut aliases: FxHashMap<IdentifierId, (InstructionId, Place)> = FxHashMap::default();
    for block in func.body.blocks.values() {
        for instr_id in &block.instructions {
            if let InstructionValue::StoreLocal { lvalue, value, .. } =
                &func.instructions[instr_id.0 as usize].value
            {
                if matches!(lvalue.kind, InstructionKind::Const | InstructionKind::Let)
                    && !reassigned.contains(&lvalue.place.identifier)
                {
                    aliases.insert(lvalue.place.identifier, (*instr_id, value.clone()));
                }
            }
        }
    }
    // The values stored in each temporary, as an optional chain and the other
    // expressions with branches do.
    let mut optional_values: FxHashMap<IdentifierId, Vec<Place>> = FxHashMap::default();
    for instr in &func.instructions {
        if let InstructionValue::StoreLocal { lvalue, value, .. } = &instr.value {
            if env.identifiers[lvalue.place.identifier.0 as usize]
                .name
                .is_none()
            {
                optional_values
                    .entry(lvalue.place.identifier)
                    .or_default()
                    .push(value.clone());
            }
        }
    }
    // The values that an optional chain tests before it continues: `user` in
    // `user?.tags`. The test of an `Optional` terminal is the `Branch` that its
    // test block ends in, after the optional terminals nested in it.
    let mut guarded: FxHashSet<IdentifierId> = FxHashSet::default();
    for block in func.body.blocks.values() {
        let Terminal::Optional {
            optional: true,
            test,
            ..
        } = &block.terminal
        else {
            continue;
        };
        let mut current = *test;
        loop {
            match func.body.blocks.get(&current).map(|block| &block.terminal) {
                Some(Terminal::Optional { fallthrough, .. }) => current = *fallthrough,
                Some(Terminal::Branch { test, .. }) => {
                    guarded.insert(test.identifier);
                    break;
                }
                _ => break,
            }
        }
    }
    let definition_of = |identifier: IdentifierId| -> Option<InstructionId> {
        match definitions.get(&identifier).map(Vec::as_slice) {
            Some([definition]) => Some(*definition),
            _ => None,
        }
    };

    // The candidate and path that `identifier` is loaded from, with the
    // instructions that load it.
    let resolve = |identifier: IdentifierId| -> Option<(
        IdentifierId,
        Vec<PathElement>,
        Vec<InstructionId>,
        Vec<Alias>,
        bool,
        Vec<usize>,
    )> {
        let mut path: Vec<PathElement> = Vec::new();
        let mut loads: Vec<InstructionId> = Vec::new();
        // Each alias, with how many elements of the path follow it.
        let mut traversed: Vec<(IdentifierId, InstructionId, usize)> = Vec::new();
        let mut optional = false;
        // For each tested value, how many elements of the path follow it.
        let mut tested: Vec<usize> = Vec::new();
        let mut current = identifier;
        // Bounds the walk through aliases.
        for _ in 0..func.instructions.len() + 1 {
            if guarded.contains(&current) {
                tested.push(path.len());
            }
            let Some(definition) = definition_of(current) else {
                // An optional chain stores each of its values in a temporary.
                match optional_values.get(&current).map(Vec::as_slice) {
                    Some([value]) => {
                        optional = true;
                        current = value.identifier;
                        continue;
                    }
                    _ => return None,
                }
            };
            loads.push(definition);
            match &func.instructions[definition.0 as usize].value {
                InstructionValue::LoadLocal { place, .. }
                | InstructionValue::LoadContext { place, .. } => {
                    if candidates.contains(&place.identifier) {
                        path.reverse();
                        loads.reverse();
                        let root_load = loads[0];
                        let aliases = traversed
                            .into_iter()
                            .map(|(variable, declaration, following)| Alias {
                                variable,
                                declaration,
                                path: path[..path.len() - following].to_vec(),
                                root_load,
                            })
                            .collect();
                        let guards = tested
                            .into_iter()
                            .map(|following| path.len() - following)
                            .collect();
                        return Some((place.identifier, path, loads, aliases, optional, guards));
                    }
                    let (declaration, value) = aliases.get(&place.identifier)?;
                    traversed.push((place.identifier, *declaration, path.len()));
                    current = value.identifier;
                }
                InstructionValue::PropertyLoad {
                    object, property, ..
                } => {
                    path.push(PathElement::Property(property.clone()));
                    current = object.identifier;
                }
                InstructionValue::ComputedLoad {
                    object, property, ..
                } => {
                    path.push(PathElement::Computed(property.clone()));
                    current = object.identifier;
                }
                // `(user as User).name = name`: a cast is the same value.
                InstructionValue::TypeCastExpression { value, .. } => {
                    current = value.identifier;
                }
                _ => return None,
            }
        }
        None
    };

    for (variable, (declaration, value)) in &aliases {
        if let Some((candidate, path, loads, _, _, _)) = resolve(value.identifier) {
            out.aliases.push(DeclaredAlias {
                function,
                candidate,
                alias: Alias {
                    variable: *variable,
                    declaration: *declaration,
                    path,
                    root_load: loads[0],
                },
            });
        }
    }

    for block in func.body.blocks.values() {
        for instr_id in &block.instructions {
            let instr = &func.instructions[instr_id.0 as usize];
            let (target, op, method_load) = match &instr.value {
                InstructionValue::PropertyStore {
                    object,
                    property,
                    value,
                    ..
                } => (
                    object,
                    MutationOp::PropertyStore {
                        property: property.clone(),
                        value: value.clone(),
                    },
                    None,
                ),
                InstructionValue::ComputedStore {
                    object,
                    property,
                    value,
                    ..
                } => (
                    object,
                    MutationOp::ComputedStore {
                        property: property.clone(),
                        value: value.clone(),
                    },
                    None,
                ),
                InstructionValue::PropertyDelete {
                    object, property, ..
                } => (
                    object,
                    MutationOp::PropertyDelete {
                        property: property.clone(),
                    },
                    None,
                ),
                InstructionValue::ComputedDelete {
                    object, property, ..
                } => (
                    object,
                    MutationOp::ComputedDelete {
                        property: property.clone(),
                    },
                    None,
                ),
                InstructionValue::MethodCall {
                    receiver,
                    property,
                    args,
                    loc,
                } => {
                    if let Some(post_render) = post_render {
                        match post_render.mutating_calls.get(&(function, *instr_id)) {
                            None => continue,
                            Some((_, analysed_loc)) if analysed_loc != loc => {
                                return Err(invariant(
                                    "The analysis of state variables describes a different call",
                                    *loc,
                                ));
                            }
                            Some((MethodMutation::Known, _)) => {}
                            Some((MethodMutation::Unknown, _)) => {
                                if is_observed(func, env, instr.lvalue.identifier) {
                                    continue;
                                }
                            }
                        }
                    }
                    // `todos.push`: the method is loaded from the receiver. In
                    // an optional chain (`todos?.push(todo)`) it is stored in
                    // a temporary first, which `resolve` reports as optional.
                    let method = match optional_values.get(&property.identifier).map(Vec::as_slice)
                    {
                        Some([value]) => value.identifier,
                        _ => property.identifier,
                    };
                    let Some(load) = definition_of(method) else {
                        continue;
                    };
                    let InstructionValue::PropertyLoad {
                        object,
                        property: method,
                        ..
                    } = &func.instructions[load.0 as usize].value
                    else {
                        continue;
                    };
                    if object.identifier != receiver.identifier {
                        continue;
                    }
                    (
                        receiver,
                        MutationOp::MethodCall {
                            method: method.clone(),
                            args: args.clone(),
                        },
                        Some(load),
                    )
                }
                _ => continue,
            };
            let Some((variable, path, mut loads, aliases, optional, guards)) =
                resolve(target.identifier)
            else {
                continue;
            };
            loads.extend(method_load);
            out.writes.push(WriteSite {
                variable,
                function: FnRef::Inner(function),
                instr: *instr_id,
                loc: instr.value.loc().copied(),
                mutation: Some(Mutation {
                    path,
                    op,
                    loads,
                    aliases,
                    // `todos?.push(todo)`: only the method is in a temporary.
                    in_optional_chain: optional
                        || matches!(
                            &instr.value,
                            InstructionValue::MethodCall { property, .. }
                                if optional_values.contains_key(&property.identifier)
                        ),
                    guards,
                    optional_call: matches!(
                        &instr.value,
                        InstructionValue::MethodCall { property, .. }
                            if guarded.contains(&property.identifier)
                    ),
                }),
            });
        }
    }
    Ok(())
}

/// The variables that are assigned again after their declaration, anywhere.
fn reassigned_identifiers(outer: &HirFunction, env: &Environment) -> FxHashSet<IdentifierId> {
    let mut reassigned = FxHashSet::default();
    let mut visit = |func: &HirFunction| {
        for instr in &func.instructions {
            match &instr.value {
                InstructionValue::StoreLocal { lvalue, .. }
                | InstructionValue::StoreContext { lvalue, .. } => {
                    if lvalue.kind == InstructionKind::Reassign {
                        reassigned.insert(lvalue.place.identifier);
                    }
                }
                InstructionValue::DeclareContext { lvalue, .. } => {
                    reassigned.insert(lvalue.place.identifier);
                }
                InstructionValue::PrefixUpdate { lvalue, .. }
                | InstructionValue::PostfixUpdate { lvalue, .. } => {
                    reassigned.insert(lvalue.identifier);
                }
                InstructionValue::Destructure { lvalue, .. } => {
                    if lvalue.kind == InstructionKind::Reassign {
                        for place in visitors::each_pattern_operand(&lvalue.pattern) {
                            reassigned.insert(place.identifier);
                        }
                    }
                }
                _ => {}
            }
        }
    };
    visit(outer);
    for function in &env.functions {
        visit(function);
    }
    reassigned
}

// =============================================================================
// Validation
// =============================================================================

fn name_of(env: &Environment, identifier: IdentifierId) -> String {
    match &env.identifiers[identifier.0 as usize].name {
        Some(name) => name.value().to_string(),
        None => "<unnamed>".to_string(),
    }
}

fn invariant(reason: &str, loc: Option<SourceLocation>) -> CompilerError {
    CompilerError::from(
        CompilerDiagnostic::new(ErrorCategory::Invariant, reason, None).with_detail(
            CompilerDiagnosticDetail::Error {
                loc,
                message: Some(reason.to_string()),
                identifier_name: None,
            },
        ),
    )
}

fn state_variable_error(
    reason: &str,
    description: String,
    details: Vec<(Option<SourceLocation>, String)>,
) -> CompilerDiagnostic {
    let mut diagnostic =
        CompilerDiagnostic::new(ErrorCategory::Immutability, reason, Some(description));
    for (loc, message) in details {
        diagnostic = diagnostic.with_detail(CompilerDiagnosticDetail::Error {
            loc,
            message: Some(message),
            identifier_name: None,
        });
    }
    diagnostic
}

fn validate(
    func: &HirFunction,
    env: &Environment,
    collected: &Collected,
    state_variables: &[IdentifierId],
    post_render: &PostRenderFunctions,
    root_of: &impl Fn(FnRef) -> Option<FunctionId>,
) -> Result<(), CompilerError> {
    let mut error = CompilerError::new();
    let unconditional = compute_unconditional_blocks(func, env.next_block_id_counter)
        .map_err(CompilerError::from)?;

    for variable in state_variables {
        let name = name_of(env, *variable);
        let declaration = &collected.candidates[variable];

        if collected.hoisted.contains(variable) {
            error.push_diagnostic(state_variable_error(
                "Cannot use a state variable before its declaration",
                format!(
                    "`{name}` is a state variable: a function reassigns it after render. \
                     Declare it before the functions that use it"
                ),
                vec![(declaration.loc, format!("`{name}` is declared here"))],
            ));
        }

        if !unconditional.contains(&declaration.block) || in_loop(func, declaration.block) {
            error.push_diagnostic(state_variable_error(
                "Cannot declare a state variable conditionally",
                format!(
                    "`{name}` is a state variable: a function reassigns it after render. \
                     State is a hook, so its declaration must run on every render: at the \
                     top level of the component or hook, before any early return"
                ),
                vec![(
                    declaration.loc,
                    format!("`{name}` is declared conditionally"),
                )],
            ));
        }

        for write in &collected.writes {
            if write.variable != *variable || root_of(write.function).is_some() {
                continue;
            }
            let may_run_after_render = chain(&collected.parents, write.function)
                .iter()
                .any(|function| post_render.derived.contains(function));
            let updated = if write.mutation.is_some() {
                "modified"
            } else {
                "reassigned"
            };
            let message = if write.function == FnRef::Outer {
                format!("`{name}` is {updated} during render")
            } else if may_run_after_render {
                format!(
                    "`{name}` is {updated} by a function that is called during render, \
                     whose result is used after render"
                )
            } else {
                format!("`{name}` is {updated} by a function that is not used after render")
            };
            error.push_diagnostic(state_variable_error(
                "Cannot update a state variable during render",
                format!(
                    "`{name}` is a state variable: a function updates it after render. \
                     Updating it during render as well would update state while \
                     rendering. Compute the value in another variable instead"
                ),
                vec![
                    (write.loc, message),
                    (declaration.loc, format!("`{name}` is declared here")),
                ],
            ));
        }

        for write in &collected.writes {
            let (FnRef::Inner(function), Some(_)) = (write.function, &write.mutation) else {
                continue;
            };
            if write.variable != *variable {
                continue;
            }
            let nested = &env.functions[function.0 as usize];
            let mutation = write.mutation.as_ref().expect("checked above");
            if mutation.optional_call {
                error.push_diagnostic(state_variable_error(
                    "Unsupported update of a state variable",
                    format!(
                        "`{name}` is a state variable: a function updates it after render. \
                         An optional call of a method that updates it is not supported"
                    ),
                    vec![(write.loc, "This method is called optionally".to_string())],
                ));
                continue;
            }
            let result = nested.instructions[write.instr.0 as usize]
                .lvalue
                .identifier;
            if is_observed(nested, env, result) {
                error.push_diagnostic(state_variable_error(
                    "Unsupported update of a state variable",
                    format!(
                        "`{name}` is a state variable: a function updates it after render. \
                         The update is applied to a copy of the state when React processes \
                         it, so its result is not available here. Read the value before \
                         the update instead (`const last = {name}.at(-1); {name}.pop();`)"
                    ),
                    vec![(write.loc, "The result of this update is used".to_string())],
                ));
            }
        }

        for (assigned, loc) in &collected.other_assignments {
            if assigned == variable {
                error.push_diagnostic(state_variable_error(
                    "Unsupported assignment to a state variable",
                    format!(
                        "`{name}` is a state variable: a function reassigns it after render. \
                         This form of assignment is not supported for a state variable, \
                         use `{name} = ...`"
                    ),
                    vec![(*loc, format!("Cannot assign `{name}` here"))],
                ));
            }
        }
    }

    for function in &collected.functions {
        let nested = &env.functions[function.0 as usize];
        if !nested.generator {
            continue;
        }
        let writes_state = collected.writes.iter().any(|write| {
            state_variables.contains(&write.variable)
                && chain(&collected.parents, write.function).contains(function)
        });
        if writes_state {
            error.push_diagnostic(state_variable_error(
                "Cannot reassign a state variable in a generator",
                "A generator runs in steps that the compiler cannot order relative to the \
                 other updates of the state"
                    .to_string(),
                vec![(
                    nested.loc,
                    "This generator reassigns a state variable".to_string(),
                )],
            ));
        }
    }

    if error.has_any_errors() {
        Err(error)
    } else {
        Ok(())
    }
}

/// Whether `block` can run more than once in a call of `func`.
fn in_loop(func: &HirFunction, block: BlockId) -> bool {
    let mut seen: FxHashSet<BlockId> = FxHashSet::default();
    let mut stack = visitors::each_terminal_successor(&func.body.blocks[&block].terminal);
    while let Some(next) = stack.pop() {
        if next == block {
            return true;
        }
        if seen.insert(next) {
            if let Some(next_block) = func.body.blocks.get(&next) {
                stack.extend(visitors::each_terminal_successor(&next_block.terminal));
            }
        }
    }
    false
}

// =============================================================================
// Emitting instructions
// =============================================================================

fn place_of(identifier: IdentifierId) -> Place {
    Place {
        identifier,
        effect: react_compiler_hir::Effect::Unknown,
        reactive: false,
        loc: None,
    }
}

fn add_instruction(
    func: &mut HirFunction,
    lvalue: Place,
    value: InstructionValue,
    loc: Option<SourceLocation>,
) -> InstructionId {
    let id = InstructionId(func.instructions.len() as u32);
    func.instructions.push(Instruction {
        id: EvaluationOrder(0),
        lvalue,
        value,
        loc,
        effects: None,
    });
    id
}

/// Adds `value` to `func` with a new temporary as its lvalue.
fn add_temporary(
    func: &mut HirFunction,
    env: &mut Environment,
    value: InstructionValue,
    loc: Option<SourceLocation>,
) -> (InstructionId, Place) {
    let lvalue = create_temporary_place(env, loc);
    let id = add_instruction(func, lvalue.clone(), value, loc);
    (id, lvalue)
}

fn named_variable(env: &mut Environment, name: String, loc: Option<SourceLocation>) -> Place {
    let place = create_temporary_place(env, loc);
    env.identifiers[place.identifier.0 as usize].name = Some(IdentifierName::Named(name));
    place
}

fn position_of(func: &HirFunction, instr: InstructionId) -> (BlockId, usize) {
    for (block_id, block) in &func.body.blocks {
        if let Some(position) = block.instructions.iter().position(|id| *id == instr) {
            return (*block_id, position);
        }
    }
    panic!("the instruction is in a block of its function");
}

fn insert_at(func: &mut HirFunction, block: BlockId, position: usize, ids: Vec<InstructionId>) {
    func.body
        .blocks
        .get_mut(&block)
        .expect("the block exists")
        .instructions
        .splice(position..position, ids);
}

fn capitalize(name: &str) -> String {
    let mut chars = name.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

/// Replaces `let x = init` with `const [x, setX] = useState(init)` and returns
/// `setX`.
fn declare_state(
    func: &mut HirFunction,
    env: &mut Environment,
    declaration: &Declaration,
    variable: IdentifierId,
    imports: &mut impl StateVariableImports,
) -> Place {
    let name = name_of(env, variable);
    let setter_name =
        env.generate_unique_identifier_name_from(&format!("set{}", capitalize(&name)));
    let setter = named_variable(env, setter_name, declaration.loc);

    let initial = match &func.instructions[declaration.instr.0 as usize].value {
        InstructionValue::StoreContext { value, .. }
        | InstructionValue::StoreLocal { value, .. } => Some(value.clone()),
        InstructionValue::DeclareContext { .. } | InstructionValue::DeclareLocal { .. } => None,
        _ => unreachable!("a candidate is declared by a store or a declaration"),
    };

    let (load_id, callee) = add_temporary(
        func,
        env,
        InstructionValue::LoadGlobal {
            binding: imports.use_state(),
            loc: declaration.loc,
        },
        declaration.loc,
    );
    let (call_id, state) = add_temporary(
        func,
        env,
        InstructionValue::CallExpression {
            callee,
            args: initial.into_iter().map(PlaceOrSpread::Place).collect(),
            loc: declaration.loc,
        },
        declaration.loc,
    );
    let mut variable_place = place_of(variable);
    variable_place.loc = declaration.loc;
    func.instructions[declaration.instr.0 as usize].value = InstructionValue::Destructure {
        lvalue: LValuePattern {
            pattern: Pattern::Array(ArrayPattern {
                items: vec![
                    ArrayPatternElement::Place(variable_place),
                    ArrayPatternElement::Place(setter.clone()),
                ],
                loc: declaration.loc,
            }),
            kind: InstructionKind::Const,
        },
        value: state,
        loc: declaration.loc,
    };
    let (block, position) = position_of(func, declaration.instr);
    insert_at(func, block, position, vec![load_id, call_id]);

    // `freezeState(x)`: in development, a modification of the state that the
    // compiler could not turn into an update throws.
    let (freeze_id, freeze) = add_temporary(
        func,
        env,
        InstructionValue::LoadGlobal {
            binding: imports.freeze_state(),
            loc: declaration.loc,
        },
        declaration.loc,
    );
    let (value_id, value) = add_temporary(
        func,
        env,
        InstructionValue::LoadLocal {
            place: place_of(variable),
            loc: declaration.loc,
        },
        declaration.loc,
    );
    let (frozen_id, _) = add_temporary(
        func,
        env,
        InstructionValue::CallExpression {
            callee: freeze,
            args: vec![PlaceOrSpread::Place(value)],
            loc: declaration.loc,
        },
        declaration.loc,
    );
    insert_at(
        func,
        block,
        position + 3,
        vec![freeze_id, value_id, frozen_id],
    );
    setter
}

/// `LoadContext x` of a state variable becomes `LoadLocal x`: nothing
/// reassigns `x` any more.
fn load_state_as_local(func: &mut HirFunction, state_variables: &FxHashSet<IdentifierId>) {
    for instr in &mut func.instructions {
        if let InstructionValue::LoadContext { place, loc } = &instr.value {
            if state_variables.contains(&place.identifier) {
                instr.value = InstructionValue::LoadLocal {
                    place: place.clone(),
                    loc: *loc,
                };
            }
        }
    }
}

// =============================================================================
// Updaters
// =============================================================================

/// What the rewrite knows about the variables that an updater may capture.
struct Bindings {
    /// Variables assigned again after their declaration (shadows included).
    reassigned: FxHashSet<IdentifierId>,
    state_variables: FxHashSet<IdentifierId>,
    /// The state variables that have a shadow in the root being rewritten. A
    /// read of any other state variable is the value of the render, which
    /// never changes for the function that reads it.
    shadowed: FxHashSet<IdentifierId>,
}

impl Bindings {
    fn is_constant(&self, env: &Environment, identifier: IdentifierId) -> bool {
        // A promoted temporary is a `const` (see `promote`).
        env.identifiers[identifier.0 as usize].name.is_some()
            && !self.reassigned.contains(&identifier)
    }

    fn is_render_value(&self, identifier: IdentifierId) -> bool {
        self.state_variables.contains(&identifier) && !self.shadowed.contains(&identifier)
    }
}

/// A value that an updater uses and does not compute from the state.
#[derive(Debug, Clone)]
enum Capture {
    /// A constant or global, computed again inside the updater.
    Clone(InstructionValue),
    /// A variable that is never reassigned, captured by the updater.
    Variable(Place),
    /// Any other temporary: stored in a new `const` where it is defined, which
    /// the updater captures.
    Promote { definition: InstructionId },
}

/// The instructions that compute the value of a write from the variable
/// itself: `count + 1` for `count = count + 1`.
#[derive(Debug, Clone)]
struct Slice {
    /// In block order. Includes the reads of the variable.
    members: Vec<InstructionId>,
    /// By the identifier of the operand.
    captures: IndexMap<IdentifierId, Capture, FxBuildHasher>,
    /// No other instruction uses the value of a member, so that the members
    /// can be moved into the updater rather than copied.
    exclusive: bool,
}

/// Instructions that an updater can repeat: no effects, and a value that only
/// depends on the operands.
fn is_pure(value: &InstructionValue) -> bool {
    matches!(
        value,
        InstructionValue::BinaryExpression { .. }
            | InstructionValue::UnaryExpression { .. }
            | InstructionValue::TemplateLiteral { .. }
            | InstructionValue::ArrayExpression { .. }
            | InstructionValue::ObjectExpression { .. }
            | InstructionValue::PropertyLoad { .. }
            | InstructionValue::ComputedLoad { .. }
            | InstructionValue::TypeCastExpression { .. }
            | InstructionValue::LoadLocal { .. }
    )
}

/// Instructions that cannot run code that writes the variable, so that they
/// may run between the read of the variable and its write.
fn is_inert(value: &InstructionValue) -> bool {
    is_pure(value)
        || matches!(
            value,
            InstructionValue::LoadContext { .. }
                | InstructionValue::LoadGlobal { .. }
                | InstructionValue::Primitive { .. }
                | InstructionValue::JSXText { .. }
                | InstructionValue::RegExpLiteral { .. }
                | InstructionValue::FunctionExpression { .. }
                | InstructionValue::ObjectMethod { .. }
                | InstructionValue::JsxExpression { .. }
                | InstructionValue::JsxFragment { .. }
                | InstructionValue::StoreLocal { .. }
                | InstructionValue::DeclareLocal { .. }
        )
}

fn use_counts(func: &HirFunction, env: &Environment) -> FxHashMap<IdentifierId, usize> {
    let mut uses: FxHashMap<IdentifierId, usize> = FxHashMap::default();
    for block in func.body.blocks.values() {
        for instr_id in &block.instructions {
            let instr = &func.instructions[instr_id.0 as usize];
            for place in visitors::each_instruction_value_operand(&instr.value, env) {
                *uses.entry(place.identifier).or_default() += 1;
            }
        }
        for place in visitors::each_terminal_operand(&block.terminal) {
            *uses.entry(place.identifier).or_default() += 1;
        }
    }
    uses
}

/// Whether anything observes the value of `identifier`. The value of
/// `sel.delete(x)` in `sel.has(x) ? sel.delete(x) : sel.add(x);` is stored in
/// the temporary of the conditional expression, which nothing uses.
fn is_observed(func: &HirFunction, env: &Environment, identifier: IdentifierId) -> bool {
    fn visit(
        func: &HirFunction,
        env: &Environment,
        identifier: IdentifierId,
        seen: &mut FxHashSet<IdentifierId>,
    ) -> bool {
        if !seen.insert(identifier) {
            return false;
        }
        for block in func.body.blocks.values() {
            for instr_id in &block.instructions {
                let instr = &func.instructions[instr_id.0 as usize];
                let uses = visitors::each_instruction_value_operand(&instr.value, env)
                    .iter()
                    .any(|place| place.identifier == identifier);
                if !uses {
                    continue;
                }
                let forwarded = match &instr.value {
                    InstructionValue::StoreLocal { lvalue, .. }
                        if env.identifiers[lvalue.place.identifier.0 as usize]
                            .name
                            .is_none() =>
                    {
                        visit(func, env, lvalue.place.identifier, seen)
                            || visit(func, env, instr.lvalue.identifier, seen)
                    }
                    InstructionValue::LoadLocal { .. } => {
                        visit(func, env, instr.lvalue.identifier, seen)
                    }
                    _ => true,
                };
                if forwarded {
                    return true;
                }
            }
            if visitors::each_terminal_operand(&block.terminal)
                .iter()
                .any(|place| place.identifier == identifier)
            {
                return true;
            }
        }
        false
    }
    visit(func, env, identifier, &mut FxHashSet::default())
}

/// The instructions of `func` that define each identifier as their lvalue.
fn definitions(func: &HirFunction) -> FxHashMap<IdentifierId, Vec<InstructionId>> {
    let mut result: FxHashMap<IdentifierId, Vec<InstructionId>> = FxHashMap::default();
    for block in func.body.blocks.values() {
        for instr_id in &block.instructions {
            let instr = &func.instructions[instr_id.0 as usize];
            result
                .entry(instr.lvalue.identifier)
                .or_default()
                .push(*instr_id);
        }
    }
    result
}

/// The slice of the write `store` (a `StoreContext` of `variable` in `func`),
/// if its value can be computed by an updater.
fn find_slice(
    func: &HirFunction,
    env: &Environment,
    variable: IdentifierId,
    store: InstructionId,
    bindings: &Bindings,
) -> Option<Slice> {
    let (block_id, store_position) = position_of(func, store);
    let block = &func.body.blocks[&block_id];
    let InstructionValue::StoreContext { value: stored, .. } =
        &func.instructions[store.0 as usize].value
    else {
        unreachable!("a write is a StoreContext");
    };

    let definitions = definitions(func);
    // The position in the block of the only definition of a temporary, if it
    // precedes the write.
    let local_definition = |identifier: IdentifierId| -> Option<(usize, InstructionId)> {
        let ids = definitions.get(&identifier)?;
        if ids.len() != 1 {
            return None;
        }
        let position = block.instructions.iter().position(|id| *id == ids[0])?;
        (position < store_position).then_some((position, ids[0]))
    };

    // Whether the value of `identifier` is computed from the variable.
    fn reads_variable(
        func: &HirFunction,
        env: &Environment,
        variable: IdentifierId,
        identifier: IdentifierId,
        local_definition: &impl Fn(IdentifierId) -> Option<(usize, InstructionId)>,
    ) -> bool {
        if identifier == variable {
            return true;
        }
        let Some((_, definition)) = local_definition(identifier) else {
            return false;
        };
        visitors::each_instruction_value_operand(
            &func.instructions[definition.0 as usize].value,
            env,
        )
        .iter()
        .any(|operand| reads_variable(func, env, variable, operand.identifier, local_definition))
    }

    let mut members: Vec<(usize, InstructionId)> = Vec::new();
    let mut captures: IndexMap<IdentifierId, Capture, FxBuildHasher> = IndexMap::default();
    let mut pending = vec![stored.identifier];
    while let Some(identifier) = pending.pop() {
        let (position, definition) = local_definition(identifier)?;
        if members.iter().any(|(_, id)| *id == definition) {
            continue;
        }
        let value = &func.instructions[definition.0 as usize].value;
        match value {
            InstructionValue::LoadContext { place, .. } if place.identifier == variable => {
                members.push((position, definition));
            }
            value if is_pure(value) => {
                members.push((position, definition));
                for operand in visitors::each_instruction_value_operand(value, env) {
                    if reads_variable(func, env, variable, operand.identifier, &local_definition) {
                        pending.push(operand.identifier);
                    } else if !captures.contains_key(&operand.identifier) {
                        let capture = find_capture(
                            func,
                            env,
                            &definitions,
                            operand.identifier,
                            block,
                            bindings,
                        )?;
                        captures.insert(operand.identifier, capture);
                    }
                }
            }
            _ => return None,
        }
    }
    members.sort_by_key(|(position, _)| *position);

    let reads_state = members.iter().any(|(_, id)| {
        matches!(
            &func.instructions[id.0 as usize].value,
            InstructionValue::LoadContext { .. }
        )
    });
    if !reads_state {
        return None;
    }

    // Nothing between the first read and the write may run code that writes
    // the variable: the updater reads the variable when it runs instead.
    let first = members[0].0;
    for position in first..store_position {
        let id = block.instructions[position];
        if members.iter().any(|(_, member)| *member == id) {
            continue;
        }
        if !is_inert(&func.instructions[id.0 as usize].value) {
            return None;
        }
    }

    let member_ids: Vec<InstructionId> = members.iter().map(|(_, id)| *id).collect();
    let uses = use_counts(func, env);
    let mut internal_uses: FxHashMap<IdentifierId, usize> = FxHashMap::default();
    for id in member_ids.iter().chain(std::iter::once(&store)) {
        for place in
            visitors::each_instruction_value_operand(&func.instructions[id.0 as usize].value, env)
        {
            *internal_uses.entry(place.identifier).or_default() += 1;
        }
    }
    let exclusive = member_ids.iter().all(|id| {
        let lvalue = func.instructions[id.0 as usize].lvalue.identifier;
        uses.get(&lvalue) == internal_uses.get(&lvalue)
    });

    Some(Slice {
        members: member_ids,
        captures,
        exclusive,
    })
}

fn find_capture(
    func: &HirFunction,
    env: &Environment,
    definitions: &FxHashMap<IdentifierId, Vec<InstructionId>>,
    identifier: IdentifierId,
    block: &BasicBlock,
    bindings: &Bindings,
) -> Option<Capture> {
    if bindings.is_constant(env, identifier) {
        return Some(Capture::Variable(place_of(identifier)));
    }
    let ids = definitions.get(&identifier)?;
    if ids.len() != 1 {
        return None;
    }
    let definition = ids[0];
    match &func.instructions[definition.0 as usize].value {
        value @ (InstructionValue::Primitive { .. } | InstructionValue::LoadGlobal { .. }) => {
            Some(Capture::Clone(value.clone()))
        }
        InstructionValue::LoadLocal { place, .. }
            if bindings.is_constant(env, place.identifier) =>
        {
            Some(Capture::Variable(place.clone()))
        }
        InstructionValue::LoadContext { place, .. }
            if bindings.is_render_value(place.identifier) =>
        {
            Some(Capture::Variable(place.clone()))
        }
        // A `const` is declared by a statement: the definition must be in the
        // block of the write, and that block must not be part of an expression.
        _ => (block.kind == BlockKind::Block && block.instructions.contains(&definition))
            .then_some(Capture::Promote { definition }),
    }
}

/// Makes every instruction and terminal of `func` that uses `from` use `to`.
fn replace_uses(func: &mut HirFunction, from: IdentifierId, to: IdentifierId) {
    for instr in &mut func.instructions {
        visitors::for_each_instruction_value_operand_mut(&mut instr.value, &mut |place| {
            if place.identifier == from {
                place.identifier = to;
            }
        });
    }
    for block in func.body.blocks.values_mut() {
        visitors::for_each_terminal_operand_mut(&mut block.terminal, &mut |place| {
            if place.identifier == from {
                place.identifier = to;
            }
        });
    }
}

/// Stores the temporary defined by `definition` in a new `const`, which every
/// other use of the temporary loads instead. Returns the `const`, and the
/// temporaries of those loads.
fn promote(
    func: &mut HirFunction,
    env: &mut Environment,
    definition: InstructionId,
) -> (Place, Vec<IdentifierId>) {
    let mut loads: Vec<IdentifierId> = Vec::new();
    let temporary = func.instructions[definition.0 as usize].lvalue.clone();
    let loc = func.instructions[definition.0 as usize].loc;
    let variable = create_temporary_place(env, loc);
    let declaration_id = env.identifiers[variable.identifier.0 as usize].declaration_id;
    env.identifiers[variable.identifier.0 as usize].name =
        Some(IdentifierName::Promoted(format!("#t{}", declaration_id.0)));

    // Replace the uses first, so that the store below is not one of them.
    let block_ids: Vec<BlockId> = func.body.blocks.keys().copied().collect();
    for block_id in block_ids {
        let ids = func.body.blocks[&block_id].instructions.clone();
        let mut rewritten: Vec<InstructionId> = Vec::with_capacity(ids.len());
        for id in ids {
            let uses_temporary = visitors::each_instruction_value_operand(
                &func.instructions[id.0 as usize].value,
                env,
            )
            .iter()
            .any(|place| place.identifier == temporary.identifier);
            // A function captures variables, never temporaries.
            if uses_temporary {
                let (load_id, load) = add_temporary(
                    func,
                    env,
                    InstructionValue::LoadLocal {
                        place: variable.clone(),
                        loc,
                    },
                    loc,
                );
                rewritten.push(load_id);
                loads.push(load.identifier);
                visitors::for_each_instruction_value_operand_mut(
                    &mut func.instructions[id.0 as usize].value,
                    &mut |place| {
                        if place.identifier == temporary.identifier {
                            place.identifier = load.identifier;
                        }
                    },
                );
            }
            rewritten.push(id);
        }
        let uses_in_terminal =
            visitors::each_terminal_operand(&func.body.blocks[&block_id].terminal)
                .iter()
                .any(|place| place.identifier == temporary.identifier);
        if uses_in_terminal {
            let (load_id, load) = add_temporary(
                func,
                env,
                InstructionValue::LoadLocal {
                    place: variable.clone(),
                    loc,
                },
                loc,
            );
            rewritten.push(load_id);
            loads.push(load.identifier);
            visitors::for_each_terminal_operand_mut(
                &mut func.body.blocks.get_mut(&block_id).unwrap().terminal,
                &mut |place| {
                    if place.identifier == temporary.identifier {
                        place.identifier = load.identifier;
                    }
                },
            );
        }
        func.body.blocks.get_mut(&block_id).unwrap().instructions = rewritten;
    }

    let (store_id, _) = add_temporary(
        func,
        env,
        InstructionValue::StoreLocal {
            lvalue: LValue {
                place: variable.clone(),
                kind: InstructionKind::Const,
            },
            value: temporary,
            type_annotation: None,
            loc,
        },
        loc,
    );
    let (block, position) = position_of(func, definition);
    insert_at(func, block, position + 1, vec![store_id]);
    (variable, loads)
}

/// Builds `variable => <slice>` and adds it to the environment. Promotes the
/// captures of the slice that need it.
fn build_updater(
    func: &mut HirFunction,
    env: &mut Environment,
    variable: IdentifierId,
    store: InstructionId,
    slice: &Slice,
) -> FunctionId {
    let loc = func.instructions[store.0 as usize].loc;
    let parameter = named_variable(env, name_of(env, variable), loc);

    let mut updater = HirFunction {
        loc,
        id: None,
        name_hint: None,
        fn_type: ReactFunctionType::Other,
        params: vec![ParamPattern::Place(parameter.clone())],
        return_type_annotation: None,
        returns: create_temporary_place(env, loc),
        context: Vec::new(),
        body: HIR {
            entry: BlockId(0),
            blocks: IndexMap::default(),
        },
        instructions: Vec::new(),
        generator: false,
        is_async: false,
        directives: Vec::new(),
        aliasing_effects: None,
    };
    let mut body: Vec<InstructionId> = Vec::new();
    // The identifiers of `func` and the identifiers of the updater that hold
    // the same value.
    let mut renamed: FxHashMap<IdentifierId, IdentifierId> = FxHashMap::default();

    for (identifier, capture) in &slice.captures {
        // The identifiers of `func` that hold the captured value.
        let mut holders = vec![*identifier];
        let value = match capture {
            Capture::Clone(value) => value.clone(),
            Capture::Variable(place) => {
                if !updater
                    .context
                    .iter()
                    .any(|captured| captured.identifier == place.identifier)
                {
                    updater.context.push(place.clone());
                }
                InstructionValue::LoadLocal {
                    place: place.clone(),
                    loc: place.loc,
                }
            }
            Capture::Promote { definition } => {
                // The members of the slice now load the `const` instead of
                // using the temporary.
                let (promoted, loads) = promote(func, env, *definition);
                holders.extend(loads);
                updater.context.push(promoted.clone());
                InstructionValue::LoadLocal {
                    place: promoted,
                    loc,
                }
            }
        };
        let value_loc = value.loc().copied();
        let (id, place) = add_temporary(&mut updater, env, value, value_loc);
        body.push(id);
        for holder in holders {
            renamed.insert(holder, place.identifier);
        }
    }

    for member in &slice.members {
        let instr = func.instructions[member.0 as usize].clone();
        let mut value = match &instr.value {
            InstructionValue::LoadContext { loc, .. } => InstructionValue::LoadLocal {
                place: parameter.clone(),
                loc: *loc,
            },
            value => value.clone(),
        };
        visitors::for_each_instruction_value_operand_mut(&mut value, &mut |place| {
            if let Some(identifier) = renamed.get(&place.identifier) {
                place.identifier = *identifier;
            }
        });
        let (id, place) = add_temporary(&mut updater, env, value, instr.loc);
        body.push(id);
        renamed.insert(instr.lvalue.identifier, place.identifier);
    }

    let InstructionValue::StoreContext { value: stored, .. } =
        &func.instructions[store.0 as usize].value
    else {
        unreachable!("a write is a StoreContext");
    };
    let mut result = stored.clone();
    result.identifier = renamed[&stored.identifier];

    let block_id = env.next_block_id();
    updater.body.entry = block_id;
    updater.body.blocks.insert(
        block_id,
        BasicBlock {
            kind: BlockKind::Block,
            id: block_id,
            instructions: body,
            terminal: Terminal::Return {
                value: result,
                return_variant: ReturnVariant::Implicit,
                id: EvaluationOrder(0),
                loc,
                effects: None,
            },
            preds: Default::default(),
            phis: Vec::new(),
        },
    );
    env.add_function(updater)
}

// =============================================================================
// Rewriting the writes of a root
// =============================================================================

struct Shadow {
    place: Place,
    /// A nested function uses the shadow, which makes it a context variable.
    is_context: bool,
}

impl Shadow {
    fn load(&self, loc: Option<SourceLocation>) -> InstructionValue {
        if self.is_context {
            InstructionValue::LoadContext {
                place: self.place.clone(),
                loc,
            }
        } else {
            InstructionValue::LoadLocal {
                place: self.place.clone(),
                loc,
            }
        }
    }

    fn store(
        &self,
        kind: InstructionKind,
        value: Place,
        loc: Option<SourceLocation>,
    ) -> InstructionValue {
        let lvalue = LValue {
            place: self.place.clone(),
            kind,
        };
        if self.is_context {
            InstructionValue::StoreContext { lvalue, value, loc }
        } else {
            InstructionValue::StoreLocal {
                lvalue,
                value,
                type_annotation: None,
                loc,
            }
        }
    }
}

fn is_read_of(value: &InstructionValue, variable: IdentifierId) -> bool {
    matches!(
        value,
        InstructionValue::LoadContext { place, .. } | InstructionValue::LoadLocal { place, .. }
            if place.identifier == variable
    )
}

/// Whether a function nested in `func`, at any depth, writes `variable`.
fn nested_function_writes(
    env: &Environment,
    nested: FunctionId,
    writes: &[WriteSite],
    variable: IdentifierId,
) -> bool {
    let func = &env.functions[nested.0 as usize];
    if writes
        .iter()
        .any(|write| write.variable == variable && write.function == FnRef::Inner(nested))
    {
        return true;
    }
    func.instructions.iter().any(|instr| match &instr.value {
        InstructionValue::FunctionExpression { lowered_func, .. }
        | InstructionValue::ObjectMethod { lowered_func, .. } => {
            nested_function_writes(env, lowered_func.func, writes, variable)
        }
        _ => false,
    })
}

/// Whether a read of `variable` in the functions of `tree` (the root first) may
/// follow a write, so that the root needs a shadow.
fn needs_shadow(
    env: &Environment,
    variable: IdentifierId,
    root: FunctionId,
    tree: &[FunctionId],
    writes: &[WriteSite],
    bindings: &Bindings,
) -> bool {
    for function in tree {
        let func = &env.functions[function.0 as usize];
        let uses = use_counts(func, env);
        let is_used = |identifier: IdentifierId| uses.get(&identifier).copied().unwrap_or(0) > 0;

        // Reads that an updater performs instead.
        let mut moved: FxHashSet<InstructionId> = FxHashSet::default();
        for write in writes {
            if write.variable != variable || write.function != FnRef::Inner(*function) {
                continue;
            }
            if let Some(mutation) = &write.mutation {
                moved.extend(removed_by_mutation(func, env, write.instr, mutation));
                continue;
            }
            // The value of the assignment expression is a read after the write.
            if is_used(func.instructions[write.instr.0 as usize].lvalue.identifier) {
                return true;
            }
            if let Some(slice) = find_slice(func, env, variable, write.instr, bindings) {
                if slice.exclusive {
                    moved.extend(slice.members.iter().copied());
                }
            }
        }
        let sites: FxHashSet<InstructionId> = writes
            .iter()
            .filter(|write| write.variable == variable && write.function == FnRef::Inner(*function))
            .map(|write| write.instr)
            .collect();

        // Where the variable may be written: a write, or the creation of a
        // function that writes (it can be called at any later point).
        let mut write_points: Vec<(BlockId, usize)> = Vec::new();
        let mut reads: Vec<(BlockId, usize)> = Vec::new();
        for (block_id, block) in &func.body.blocks {
            for (position, id) in block.instructions.iter().enumerate() {
                let instr = &func.instructions[id.0 as usize];
                match &instr.value {
                    _ if sites.contains(id) => {
                        write_points.push((*block_id, position));
                    }
                    InstructionValue::FunctionExpression { lowered_func, .. }
                    | InstructionValue::ObjectMethod { lowered_func, .. } => {
                        if nested_function_writes(env, lowered_func.func, writes, variable) {
                            write_points.push((*block_id, position));
                        }
                    }
                    value if is_read_of(value, variable) => {
                        if is_used(instr.lvalue.identifier) && !moved.contains(id) {
                            reads.push((*block_id, position));
                        }
                    }
                    _ => {}
                }
            }
        }
        if reads.is_empty() {
            continue;
        }
        // A nested function can be called after any write of the root.
        if *function != root {
            return true;
        }
        for (write_block, write_position) in &write_points {
            let reachable = blocks_after(func, *write_block);
            for (read_block, read_position) in &reads {
                if (read_block == write_block && read_position > write_position)
                    || reachable.contains(read_block)
                {
                    return true;
                }
            }
        }
    }
    false
}

/// The outermost optional chain that an instruction is part of.
struct OptionalChain {
    /// The block that ends in the `Optional` terminal of the chain.
    block: BlockId,
    /// The blocks of the chain: every block between `block` and `fallthrough`.
    region: Vec<BlockId>,
    fallthrough: BlockId,
}

fn optional_chain_of(func: &HirFunction, instr: InstructionId) -> Option<OptionalChain> {
    let (instr_block, _) = position_of(func, instr);
    let mut outermost: Option<OptionalChain> = None;
    for (block_id, block) in &func.body.blocks {
        let Terminal::Optional {
            test, fallthrough, ..
        } = &block.terminal
        else {
            continue;
        };
        let mut region: Vec<BlockId> = Vec::new();
        let mut stack = vec![*test];
        while let Some(next) = stack.pop() {
            if next == *fallthrough || region.contains(&next) {
                continue;
            }
            region.push(next);
            if let Some(next_block) = func.body.blocks.get(&next) {
                stack.extend(visitors::each_terminal_successor(&next_block.terminal));
            }
        }
        if !region.contains(&instr_block) {
            continue;
        }
        // The chains around an instruction are nested: the outermost one has
        // the most blocks.
        if outermost
            .as_ref()
            .is_none_or(|chain| chain.region.len() < region.len())
        {
            outermost = Some(OptionalChain {
                block: *block_id,
                region,
                fallthrough: *fallthrough,
            });
        }
    }
    outermost
}

/// The instructions that a mutation no longer needs once an updater performs
/// it: the mutation itself, and the loads of its path that nothing else uses.
/// For a mutation in an optional chain, the whole chain: the updater tests
/// what the chain tests.
fn removed_by_mutation(
    func: &HirFunction,
    env: &Environment,
    instr: InstructionId,
    mutation: &Mutation,
) -> FxHashSet<InstructionId> {
    if mutation.in_optional_chain {
        if let Some(chain) = optional_chain_of(func, instr) {
            return chain
                .region
                .iter()
                .flat_map(|block| func.body.blocks[block].instructions.iter().copied())
                .collect();
        }
    }
    // The instructions that use each identifier (`None` for a terminal).
    let mut users: FxHashMap<IdentifierId, Vec<Option<InstructionId>>> = FxHashMap::default();
    for block in func.body.blocks.values() {
        for id in &block.instructions {
            let value = &func.instructions[id.0 as usize].value;
            for place in visitors::each_instruction_value_operand(value, env) {
                users.entry(place.identifier).or_default().push(Some(*id));
            }
        }
        for place in visitors::each_terminal_operand(&block.terminal) {
            users.entry(place.identifier).or_default().push(None);
        }
    }
    let mut removed: FxHashSet<InstructionId> = FxHashSet::default();
    removed.insert(instr);
    // A load is only used by later loads and by the mutation, so visit the
    // loads from the last one.
    let mut changed = true;
    while changed {
        changed = false;
        for load in mutation.loads.iter().rev() {
            if removed.contains(load) {
                continue;
            }
            let lvalue = func.instructions[load.0 as usize].lvalue.identifier;
            let only_used_by_removed = users.get(&lvalue).is_none_or(|users| {
                users
                    .iter()
                    .all(|user| user.is_some_and(|user| removed.contains(&user)))
            });
            if only_used_by_removed {
                removed.insert(*load);
                changed = true;
            }
        }
    }
    removed
}

/// The blocks that can run after `block` has run (`block` itself if it is in a
/// loop).
fn blocks_after(func: &HirFunction, block: BlockId) -> FxHashSet<BlockId> {
    let mut seen: FxHashSet<BlockId> = FxHashSet::default();
    let mut stack = visitors::each_terminal_successor(&func.body.blocks[&block].terminal);
    while let Some(next) = stack.pop() {
        if seen.insert(next) {
            if let Some(next_block) = func.body.blocks.get(&next) {
                stack.extend(visitors::each_terminal_successor(&next_block.terminal));
            }
        }
    }
    seen
}

/// The shadow of `variable` in `root`.
fn create_shadow(
    env: &mut Environment,
    variable: IdentifierId,
    root: FunctionId,
    tree: &[FunctionId],
) -> Shadow {
    let is_context = tree.iter().any(|function| {
        *function != root
            && env.functions[function.0 as usize]
                .instructions
                .iter()
                .any(|instr| match &instr.value {
                    InstructionValue::StoreContext { lvalue, .. } => {
                        lvalue.place.identifier == variable
                    }
                    value => is_read_of(value, variable),
                })
    });
    let name = env.generate_unique_identifier_name_from(&format!(
        "current{}",
        capitalize(&name_of(env, variable))
    ));
    let loc = env.functions[root.0 as usize].loc;
    Shadow {
        place: named_variable(env, name, loc),
        is_context,
    }
}

/// Rewrites the reads and writes of `variable` in `func`, the root of the
/// writes or a function nested in it.
fn rewrite_function(
    func: &mut HirFunction,
    env: &mut Environment,
    variable: IdentifierId,
    setter: &Place,
    shadow: Option<&Shadow>,
    is_root: bool,
    function: FnRef,
    writes: &[WriteSite],
    bindings: &Bindings,
    copy: Option<&NonLocalBinding>,
) -> Result<(), CompilerError> {
    // The value of `count += 1` is a read of `count` that nothing uses when the
    // assignment is a statement. Remove it: otherwise the function would
    // capture the state, and depend on it, only to discard it.
    let uses = use_counts(func, env);
    for block in func.body.blocks.values_mut() {
        block.instructions.retain(|id| {
            let instr = &func.instructions[id.0 as usize];
            !(is_read_of(&instr.value, variable)
                && uses.get(&instr.lvalue.identifier).copied().unwrap_or(0) == 0)
        });
    }

    for write in writes {
        if write.variable != variable || write.function != function {
            continue;
        }
        if let Some(mutation) = &write.mutation {
            let copy = copy.expect("the import exists when a state variable is mutated");
            rewrite_mutation(
                func, env, variable, setter, shadow, write, mutation, bindings, copy,
            )?;
            continue;
        }
        let store = write.instr;
        let loc = write.loc;
        let slice = find_slice(func, env, variable, store, bindings);
        let InstructionValue::StoreContext { value: stored, .. } =
            func.instructions[store.0 as usize].value.clone()
        else {
            unreachable!("a write is a StoreContext");
        };

        // The argument of the setter, and the instructions that compute it.
        let mut emitted: Vec<InstructionId> = Vec::new();
        let argument = match &slice {
            Some(slice) => {
                let updater = build_updater(func, env, variable, store, slice);
                let (id, place) = add_temporary(
                    func,
                    env,
                    InstructionValue::FunctionExpression {
                        name: None,
                        name_hint: None,
                        lowered_func: LoweredFunction { func: updater },
                        expr_type: FunctionExpressionType::ArrowFunctionExpression,
                        loc,
                    },
                    loc,
                );
                emitted.push(id);
                place
            }
            None => match shadow {
                Some(shadow) => {
                    let (id, place) = add_temporary(func, env, shadow.load(loc), loc);
                    emitted.push(id);
                    place
                }
                None => stored.clone(),
            },
        };
        let (load_id, callee) = add_temporary(
            func,
            env,
            InstructionValue::LoadLocal {
                place: setter.clone(),
                loc,
            },
            loc,
        );
        let (call_id, _) = add_temporary(
            func,
            env,
            InstructionValue::CallExpression {
                callee,
                args: vec![PlaceOrSpread::Place(argument)],
                loc,
            },
            loc,
        );
        emitted.push(load_id);
        emitted.push(call_id);

        // `promote` may have added instructions, so find the write again.
        let (block, position) = position_of(func, store);
        match shadow {
            Some(shadow) => {
                func.instructions[store.0 as usize].value =
                    shadow.store(InstructionKind::Reassign, stored, loc);
                // The value of the assignment expression (`c && (count = 5)`,
                // `return (count = 5)`) is read after the call of the setter.
                // The call must not come between the store and the use of its
                // value, which inside an expression cannot be a statement of
                // its own: the value is read from the shadow instead.
                let result = func.instructions[store.0 as usize].lvalue.identifier;
                if use_counts(func, env).get(&result).copied().unwrap_or(0) > 0 {
                    let (load_id, load) = add_temporary(func, env, shadow.load(loc), loc);
                    replace_uses(func, result, load.identifier);
                    emitted.push(load_id);
                }
                insert_at(func, block, position + 1, emitted);
            }
            None => {
                insert_at(func, block, position + 1, emitted);
                // The updater computes the value instead, unless something
                // else uses it (`return count++`): then it is computed here as
                // well, from the value of the render.
                let removed: FxHashSet<InstructionId> = slice
                    .iter()
                    .filter(|slice| slice.exclusive)
                    .flat_map(|slice| slice.members.iter().copied())
                    .chain(std::iter::once(store))
                    .collect();
                for block in func.body.blocks.values_mut() {
                    block.instructions.retain(|id| !removed.contains(id));
                }
            }
        }
    }

    if let Some(shadow) = shadow {
        for instr in &mut func.instructions {
            if is_read_of(&instr.value, variable) {
                let loc = instr.value.loc().copied();
                instr.value = shadow.load(loc);
            }
        }
        if is_root {
            let loc = func.loc;
            let (load_id, state) = add_temporary(
                func,
                env,
                InstructionValue::LoadLocal {
                    place: place_of(variable),
                    loc,
                },
                loc,
            );
            let (store_id, _) = add_temporary(
                func,
                env,
                shadow.store(InstructionKind::Let, state, loc),
                loc,
            );
            let entry = func.body.entry;
            insert_at(func, entry, 0, vec![load_id, store_id]);
        }
    }
    Ok(())
}

// =============================================================================
// Aliases
// =============================================================================

/// Whether `prefix` may be the start of `path` (or all of it). Computed keys
/// are not compared: any two may be equal.
fn may_be_prefix(prefix: &[PathElement], path: &[PathElement]) -> bool {
    prefix.len() <= path.len()
        && prefix.iter().zip(path).all(|pair| match pair {
            (PathElement::Property(a), PathElement::Property(b)) => a == b,
            _ => true,
        })
}

/// Whether `write` leaves the same object at `path`. An assignment does not,
/// nor does a store to a place on the path (`todos[0] = other` for
/// `todos[0].tags`), nor a method that may rearrange a value on the path
/// (`todos.sort()`).
fn preserves_path(write: &WriteSite, path: &[PathElement]) -> bool {
    let Some(mutation) = &write.mutation else {
        return false;
    };
    match &mutation.op {
        // Replaces the value at `mutation.path` + the key.
        MutationOp::PropertyStore { .. }
        | MutationOp::ComputedStore { .. }
        | MutationOp::PropertyDelete { .. }
        | MutationOp::ComputedDelete { .. } => {
            let key = match &mutation.op {
                MutationOp::PropertyStore { property, .. }
                | MutationOp::PropertyDelete { property } => {
                    PathElement::Property(property.clone())
                }
                MutationOp::ComputedStore { property, .. }
                | MutationOp::ComputedDelete { property } => {
                    PathElement::Computed(property.clone())
                }
                MutationOp::MethodCall { .. } => unreachable!(),
            };
            let mut replaced = mutation.path.clone();
            replaced.push(key);
            !may_be_prefix(&replaced, path)
        }
        // May replace any value directly under `mutation.path`.
        MutationOp::MethodCall { .. } => {
            !(mutation.path.len() < path.len() && may_be_prefix(&mutation.path, path))
        }
    }
}

/// Whether `first` may run before `second` in a call of `func`.
fn precedes(func: &HirFunction, first: InstructionId, second: InstructionId) -> bool {
    let (first_block, first_position) = position_of(func, first);
    let (second_block, second_position) = position_of(func, second);
    (first_block == second_block && first_position < second_position)
        || blocks_after(func, first_block).contains(&second_block)
}

/// `const todo = todos[i]; todo.count++; todo.count++;`
///
/// An update of the state does not modify the object that an alias holds: it
/// replaces it with a copy. So a read of the alias that follows an update of
/// its object would read the object before the update. Such a read is replaced
/// with a read of the path (`todos[i]`), which is then a read of the state that
/// follows a write (see `needs_shadow`).
///
/// A path only names the same object as the alias while nothing replaces what
/// is on it. If something may have, since the alias was declared, neither a
/// read nor a mutation through the alias can be compiled.
///
/// Returns whether an instruction was changed.
fn reload_stale_aliases(
    env: &mut Environment,
    collected: &Collected,
    state_variables: &[IdentifierId],
    reassigned: FxHashSet<IdentifierId>,
) -> Result<bool, CompilerError> {
    // No state variable is known to be a value of the render yet, so a key
    // that reads one is stored in a `const`.
    let bindings = Bindings {
        reassigned,
        state_variables: FxHashSet::default(),
        shadowed: FxHashSet::default(),
    };
    let mut changed = false;
    for declared in &collected.aliases {
        if !state_variables.contains(&declared.candidate) {
            continue;
        }
        let alias = &declared.alias;
        let writes: Vec<&WriteSite> = collected
            .writes
            .iter()
            .filter(|write| {
                write.variable == declared.candidate
                    && write.function == FnRef::Inner(declared.function)
            })
            .collect();
        // The updates of the object that the alias holds.
        let updates: Vec<&WriteSite> = writes
            .iter()
            .copied()
            .filter(|write| {
                write
                    .mutation
                    .as_ref()
                    .is_some_and(|mutation| may_be_prefix(&alias.path, &mutation.path))
            })
            .collect();

        let mut func = std::mem::replace(
            &mut env.functions[declared.function.0 as usize],
            placeholder_function(),
        );
        let result = (|| -> Result<(), CompilerError> {
            // Functions nested in `func` that write the candidate may be
            // called anywhere after they are created.
            let nested_writers: Vec<InstructionId> = func
                .body
                .blocks
                .values()
                .flat_map(|block| block.instructions.iter().copied())
                .filter(|id| match &func.instructions[id.0 as usize].value {
                    InstructionValue::FunctionExpression { lowered_func, .. }
                    | InstructionValue::ObjectMethod { lowered_func, .. } => {
                        nested_function_writes(
                            env,
                            lowered_func.func,
                            &collected.writes,
                            declared.candidate,
                        )
                    }
                    _ => false,
                })
                .collect();
            // Whether the alias still names its path at `at`.
            let is_current = |func: &HirFunction, at: InstructionId| -> bool {
                writes.iter().all(|write| {
                    write.instr == at
                        || !(precedes(func, alias.declaration, write.instr)
                            && precedes(func, write.instr, at))
                        || preserves_path(write, &alias.path)
                }) && nested_writers.iter().all(|writer| {
                    !(precedes(func, alias.declaration, *writer) && precedes(func, *writer, at))
                })
            };
            let stale = |env: &Environment, loc: Option<SourceLocation>| {
                unsupported_mutation(
                    env,
                    declared.candidate,
                    loc,
                    &format!(
                        "`{}` may no longer be the same part of the state here: the state \
                         was updated since `{}` was declared",
                        name_of(env, alias.variable),
                        name_of(env, alias.variable),
                    ),
                    "Read the value from the state variable again after the update",
                )
            };

            for write in &writes {
                let through_alias = write.mutation.as_ref().is_some_and(|mutation| {
                    mutation
                        .aliases
                        .iter()
                        .any(|used| used.variable == alias.variable)
                });
                if through_alias && !is_current(&func, write.instr) {
                    return Err(stale(env, write.loc));
                }
            }
            if updates.is_empty() {
                return Ok(());
            }

            // Including the loads of later mutations through the alias:
            // `todo.count++` reads `todo.count` from the object it loads.
            let loads: Vec<InstructionId> = func
                .body
                .blocks
                .values()
                .flat_map(|block| block.instructions.iter().copied())
                .filter(|id| {
                    matches!(
                        &func.instructions[id.0 as usize].value,
                        InstructionValue::LoadLocal { place, .. }
                            if place.identifier == alias.variable
                    )
                })
                .collect();
            for load in loads {
                let follows_update = updates
                    .iter()
                    .any(|update| precedes(&func, update.instr, load));
                if !follows_update {
                    continue;
                }
                let loc = func.instructions[load.0 as usize].loc;
                if !is_current(&func, load) {
                    return Err(stale(env, loc));
                }
                reload_alias(&mut func, env, declared.candidate, alias, load, &bindings)?;
                changed = true;
            }

            // A nested function that captures the alias reads it at some
            // unknown later point.
            let captured = func.instructions.iter().any(|instr| match &instr.value {
                InstructionValue::FunctionExpression { lowered_func, .. }
                | InstructionValue::ObjectMethod { lowered_func, .. } => env.functions
                    [lowered_func.func.0 as usize]
                    .context
                    .iter()
                    .any(|place| place.identifier == alias.variable),
                _ => false,
            });
            if captured {
                let loc = func.instructions[alias.declaration.0 as usize].loc;
                return Err(stale(env, loc));
            }
            Ok(())
        })();
        env.functions[declared.function.0 as usize] = func;
        result?;
    }
    Ok(changed)
}

/// Replaces `load`, a `LoadLocal` of `alias`, with a load of its path.
fn reload_alias(
    func: &mut HirFunction,
    env: &mut Environment,
    candidate: IdentifierId,
    alias: &Alias,
    load: InstructionId,
    bindings: &Bindings,
) -> Result<(), CompilerError> {
    let loc = func.instructions[load.0 as usize].loc;
    // How to compute each key of the path again.
    let mut keys: Vec<Option<InstructionValue>> = Vec::new();
    for element in &alias.path {
        let PathElement::Computed(key) = element else {
            keys.push(None);
            continue;
        };
        let definitions = definitions(func);
        let (block_id, _) = position_of(func, alias.declaration);
        let block = &func.body.blocks[&block_id];
        let capture = find_capture(func, env, &definitions, key.identifier, block, bindings);
        let value = match capture {
            Some(Capture::Clone(value)) => value,
            Some(Capture::Variable(place)) => InstructionValue::LoadLocal {
                loc: place.loc,
                place,
            },
            Some(Capture::Promote { definition }) => {
                let (promoted, _) = promote(func, env, definition);
                InstructionValue::LoadLocal {
                    place: promoted,
                    loc,
                }
            }
            None => {
                return Err(unsupported_mutation(
                    env,
                    candidate,
                    key.loc.or(loc),
                    "Cannot tell where this key is computed",
                    "Compute the key in a `const` first",
                ));
            }
        };
        keys.push(Some(value));
    }

    let mut emitted: Vec<InstructionId> = Vec::new();
    let mut value = func.instructions[alias.root_load.0 as usize].value.clone();
    for (element, key) in alias.path.iter().zip(keys) {
        let (id, object) = add_temporary(func, env, value, loc);
        emitted.push(id);
        value = match element {
            PathElement::Property(property) => InstructionValue::PropertyLoad {
                object,
                property: property.clone(),
                loc,
            },
            PathElement::Computed(_) => {
                let (id, property) =
                    add_temporary(func, env, key.expect("a computed element has a key"), loc);
                emitted.push(id);
                InstructionValue::ComputedLoad {
                    object,
                    property,
                    loc,
                }
            }
        };
    }
    func.instructions[load.0 as usize].value = value;
    let (block, position) = position_of(func, load);
    insert_at(func, block, position, emitted);
    Ok(())
}

// =============================================================================
// Mutations
// =============================================================================

fn unsupported_mutation(
    env: &Environment,
    variable: IdentifierId,
    loc: Option<SourceLocation>,
    message: &str,
    suggestion: &str,
) -> CompilerError {
    let name = name_of(env, variable);
    CompilerError::from(state_variable_error(
        "Unsupported update of a state variable",
        format!("`{name}` is a state variable: a function updates it after render. {suggestion}"),
        vec![(loc, message.to_string())],
    ))
}

fn promoted_variable(env: &mut Environment, loc: Option<SourceLocation>) -> Place {
    let variable = create_temporary_place(env, loc);
    let declaration_id = env.identifiers[variable.identifier.0 as usize].declaration_id;
    env.identifiers[variable.identifier.0 as usize].name =
        Some(IdentifierName::Promoted(format!("#t{}", declaration_id.0)));
    variable
}

/// Replaces a mutation of the value of `variable` with a call of its setter
/// with an updater that performs the mutation on a copy (see
/// `build_mutation_updater`). With a shadow, the updater is also applied to
/// the shadow:
///
/// ```js
/// const update = todos => { ... };
/// currentTodos = update(currentTodos);
/// setTodos(update);
/// ```
fn rewrite_mutation(
    func: &mut HirFunction,
    env: &mut Environment,
    variable: IdentifierId,
    setter: &Place,
    shadow: Option<&Shadow>,
    write: &WriteSite,
    mutation: &Mutation,
    bindings: &Bindings,
    copy: &NonLocalBinding,
) -> Result<(), CompilerError> {
    let loc = write.loc;
    let updater = build_mutation_updater(func, env, variable, write, mutation, bindings, copy)?;
    let removed = removed_by_mutation(func, env, write.instr, mutation);

    let mut emitted: Vec<InstructionId> = Vec::new();
    let mut emit = |func: &mut HirFunction, env: &mut Environment, value: InstructionValue| {
        let (id, place) = add_temporary(func, env, value, loc);
        emitted.push(id);
        place
    };
    let updater = emit(
        func,
        env,
        InstructionValue::FunctionExpression {
            name: None,
            name_hint: None,
            lowered_func: LoweredFunction { func: updater },
            expr_type: FunctionExpressionType::ArrowFunctionExpression,
            loc,
        },
    );
    let argument = match shadow {
        None => updater,
        Some(shadow) => {
            // An optional chain is replaced as a whole, where it started.
            let block = match optional_chain_of(func, write.instr) {
                Some(chain) if mutation.in_optional_chain => chain.block,
                _ => position_of(func, write.instr).0,
            };
            if func.body.blocks[&block].kind != BlockKind::Block {
                return Err(unsupported_mutation(
                    env,
                    variable,
                    loc,
                    "This update is part of an expression, and the variable is read after it",
                    "Make the update a statement of its own",
                ));
            }
            let update = promoted_variable(env, loc);
            emit(
                func,
                env,
                InstructionValue::StoreLocal {
                    lvalue: LValue {
                        place: update.clone(),
                        kind: InstructionKind::Const,
                    },
                    value: updater,
                    type_annotation: None,
                    loc,
                },
            );
            let callee = emit(
                func,
                env,
                InstructionValue::LoadLocal {
                    place: update.clone(),
                    loc,
                },
            );
            let current = emit(func, env, shadow.load(loc));
            let updated = emit(
                func,
                env,
                InstructionValue::CallExpression {
                    callee,
                    args: vec![PlaceOrSpread::Place(current)],
                    loc,
                },
            );
            emit(
                func,
                env,
                shadow.store(InstructionKind::Reassign, updated, loc),
            );
            emit(
                func,
                env,
                InstructionValue::LoadLocal { place: update, loc },
            )
        }
    };
    let callee = emit(
        func,
        env,
        InstructionValue::LoadLocal {
            place: setter.clone(),
            loc,
        },
    );
    // The call takes the place of the mutation, also as the value of an
    // expression that the mutation is part of (`cond && todos.push(todo)`),
    // which nothing observes (see `validate`).
    let result = func.instructions[write.instr.0 as usize].lvalue.clone();
    let call_id = add_instruction(
        func,
        result,
        InstructionValue::CallExpression {
            callee,
            args: vec![PlaceOrSpread::Place(argument)],
            loc,
        },
        loc,
    );
    emitted.push(call_id);

    if mutation.in_optional_chain {
        // `user?.tags.push(tag)` becomes `setUser(updater)`: the updater tests
        // `user`. The call goes where the chain started, and the blocks of the
        // chain are removed.
        let chain = optional_chain_of(func, write.instr).expect("the mutation is in a chain");
        let loc = func.body.blocks[&chain.block].terminal.loc().copied();

        // The chain stores its value in a temporary, which what follows the
        // chain may forward (`enabled && todos?.push(todo)`), though nothing
        // observes it (see `validate`). The call is that value now.
        let mut stored: Vec<Place> = Vec::new();
        for block in &chain.region {
            for id in &func.body.blocks[block].instructions {
                if let InstructionValue::StoreLocal { lvalue, .. } =
                    &func.instructions[id.0 as usize].value
                {
                    let identifier = lvalue.place.identifier;
                    if env.identifiers[identifier.0 as usize].name.is_none()
                        && !stored.iter().any(|place| place.identifier == identifier)
                    {
                        stored.push(lvalue.place.clone());
                    }
                }
            }
        }
        let used_after: Vec<Place> = stored
            .into_iter()
            .filter(|place| {
                func.body.blocks.iter().any(|(block_id, block)| {
                    !chain.region.contains(block_id)
                        && (block.instructions.iter().any(|id| {
                            visitors::each_instruction_value_operand(
                                &func.instructions[id.0 as usize].value,
                                env,
                            )
                            .iter()
                            .any(|operand| operand.identifier == place.identifier)
                        }) || visitors::each_terminal_operand(&block.terminal)
                            .iter()
                            .any(|operand| operand.identifier == place.identifier))
                })
            })
            .collect();
        if used_after.len() > 1 {
            // A temporary is used once, so the call can be one value only.
            return Err(unsupported_mutation(
                env,
                variable,
                loc,
                "Cannot tell which value of this optional chain is used",
                "Make the update a statement of its own",
            ));
        }
        let call_result = func.instructions[write.instr.0 as usize].lvalue.clone();
        for place in used_after {
            let (id, _) = add_temporary(
                func,
                env,
                InstructionValue::StoreLocal {
                    lvalue: LValue {
                        place,
                        kind: InstructionKind::Const,
                    },
                    value: call_result.clone(),
                    type_annotation: None,
                    loc,
                },
                loc,
            );
            emitted.push(id);
        }

        let block = func
            .body
            .blocks
            .get_mut(&chain.block)
            .expect("the block exists");
        block.instructions.extend(emitted);
        block.terminal = Terminal::Goto {
            block: chain.fallthrough,
            variant: react_compiler_hir::GotoVariant::Break,
            id: EvaluationOrder(0),
            loc,
        };
        for removed_block in &chain.region {
            func.body.blocks.shift_remove(removed_block);
        }
        mark_predecessors(&mut func.body);
        return Ok(());
    }

    let (block, position) = position_of(func, write.instr);
    insert_at(func, block, position + 1, emitted);
    for block in func.body.blocks.values_mut() {
        block.instructions.retain(|id| !removed.contains(id));
    }
    Ok(())
}

/// Builds the updater of a mutation: it copies the value of the state and each
/// value on the path to the mutated one, and mutates the last copy, so that
/// the state is updated without being modified.
///
/// ```js
/// user.address.city = city;
/// // =>
/// user => {
///   const t0 = copyForUpdate(user);
///   const t1 = copyForUpdate(t0.address);
///   t0.address = t1;
///   t1.city = city;
///   return t0;
/// }
/// ```
///
/// Everything else that the mutation uses (keys, the stored value, arguments)
/// is computed where the mutation was, and captured.
fn build_mutation_updater(
    func: &mut HirFunction,
    env: &mut Environment,
    variable: IdentifierId,
    write: &WriteSite,
    mutation: &Mutation,
    bindings: &Bindings,
    copy: &NonLocalBinding,
) -> Result<FunctionId, CompilerError> {
    let loc = write.loc;
    let (block_id, _) = position_of(func, write.instr);

    let mut operands: Vec<Place> = Vec::new();
    for element in &mutation.path {
        if let PathElement::Computed(place) = element {
            operands.push(place.clone());
        }
    }
    match &mutation.op {
        MutationOp::PropertyStore { value, .. } => operands.push(value.clone()),
        MutationOp::ComputedStore { property, value } => {
            operands.push(property.clone());
            operands.push(value.clone());
        }
        MutationOp::PropertyDelete { .. } => {}
        MutationOp::ComputedDelete { property } => operands.push(property.clone()),
        MutationOp::MethodCall { args, .. } => operands.extend(visitors::each_call_argument(args)),
    }

    let definitions = definitions(func);
    let mut captures: IndexMap<IdentifierId, Capture, FxBuildHasher> = IndexMap::default();
    for operand in &operands {
        if captures.contains_key(&operand.identifier) {
            continue;
        }
        let block = &func.body.blocks[&block_id];
        let Some(capture) =
            find_capture(func, env, &definitions, operand.identifier, block, bindings)
        else {
            return Err(unsupported_mutation(
                env,
                variable,
                operand.loc.or(loc),
                "Cannot tell where this value is computed",
                "Compute the value in a `const` before the update",
            ));
        };
        captures.insert(operand.identifier, capture);
    }

    // How the updater computes each captured value. An instruction value is
    // emitted for every use: a temporary is only used once.
    let mut context: Vec<Place> = Vec::new();
    let mut sources: FxHashMap<IdentifierId, InstructionValue> = FxHashMap::default();
    for (identifier, capture) in captures {
        let value = match capture {
            Capture::Clone(value) => value,
            Capture::Variable(place) => {
                if !context
                    .iter()
                    .any(|captured| captured.identifier == place.identifier)
                {
                    context.push(place.clone());
                }
                InstructionValue::LoadLocal {
                    loc: place.loc,
                    place,
                }
            }
            Capture::Promote { definition } => {
                let (promoted, _) = promote(func, env, definition);
                context.push(promoted.clone());
                InstructionValue::LoadLocal {
                    place: promoted,
                    loc,
                }
            }
        };
        sources.insert(identifier, value);
    }

    let parameter = named_variable(env, name_of(env, variable), loc);
    let mut updater = HirFunction {
        loc,
        id: None,
        name_hint: None,
        fn_type: ReactFunctionType::Other,
        params: vec![ParamPattern::Place(parameter.clone())],
        return_type_annotation: None,
        returns: create_temporary_place(env, loc),
        context,
        body: HIR {
            entry: BlockId(0),
            blocks: IndexMap::default(),
        },
        instructions: Vec::new(),
        generator: false,
        is_async: false,
        directives: Vec::new(),
        aliasing_effects: None,
    };
    let mut body: Vec<InstructionId> = Vec::new();

    fn emit(
        updater: &mut HirFunction,
        env: &mut Environment,
        body: &mut Vec<InstructionId>,
        value: InstructionValue,
        loc: Option<SourceLocation>,
    ) -> Place {
        let (id, place) = add_temporary(updater, env, value, loc);
        body.push(id);
        place
    }
    // `const copy = copyForUpdate(value)`
    let copy_of = |updater: &mut HirFunction,
                   env: &mut Environment,
                   body: &mut Vec<InstructionId>,
                   value: Place|
     -> Place {
        let callee = emit(
            updater,
            env,
            body,
            InstructionValue::LoadGlobal {
                binding: copy.clone(),
                loc,
            },
            loc,
        );
        let copied = emit(
            updater,
            env,
            body,
            InstructionValue::CallExpression {
                callee,
                args: vec![PlaceOrSpread::Place(value)],
                loc,
            },
            loc,
        );
        let variable = promoted_variable(env, loc);
        emit(
            updater,
            env,
            body,
            InstructionValue::StoreLocal {
                lvalue: LValue {
                    place: variable.clone(),
                    kind: InstructionKind::Const,
                },
                value: copied,
                type_annotation: None,
                loc,
            },
            loc,
        );
        variable
    };
    let load = |place: &Place| InstructionValue::LoadLocal {
        place: place.clone(),
        loc,
    };

    // `if (value == null) return state;`: ends the block being built, which
    // `finished` collects, and starts the next one. What an optional chain
    // tests, the updater tests in the state that it is given, and leaves that
    // state as it is.
    let mut finished: Vec<BasicBlock> = Vec::new();
    let mut block_id = env.next_block_id();
    let entry = block_id;
    let mut guard = |updater: &mut HirFunction,
                     env: &mut Environment,
                     body: &mut Vec<InstructionId>,
                     block_id: &mut BlockId,
                     value: Place| {
        let null = emit(
            updater,
            env,
            body,
            InstructionValue::Primitive {
                value: react_compiler_hir::PrimitiveValue::Null,
                loc,
            },
            loc,
        );
        let test = emit(
            updater,
            env,
            body,
            InstructionValue::BinaryExpression {
                operator: react_compiler_hir::BinaryOperator::Equal,
                left: value,
                right: null,
                loc,
            },
            loc,
        );
        let unchanged_block = env.next_block_id();
        let next_block = env.next_block_id();
        finished.push(BasicBlock {
            kind: BlockKind::Block,
            id: *block_id,
            instructions: std::mem::take(body),
            terminal: Terminal::If {
                test,
                consequent: unchanged_block,
                alternate: next_block,
                fallthrough: next_block,
                id: EvaluationOrder(0),
                loc,
            },
            preds: Default::default(),
            phis: Vec::new(),
        });
        let mut unchanged_body: Vec<InstructionId> = Vec::new();
        let unchanged = emit(updater, env, &mut unchanged_body, load(&parameter), loc);
        finished.push(BasicBlock {
            kind: BlockKind::Block,
            id: unchanged_block,
            instructions: unchanged_body,
            terminal: Terminal::Return {
                value: unchanged,
                return_variant: ReturnVariant::Explicit,
                id: EvaluationOrder(0),
                loc,
                effects: None,
            },
            preds: Default::default(),
            phis: Vec::new(),
        });
        *block_id = next_block;
    };

    if mutation.guards.contains(&0) {
        let state = emit(&mut updater, env, &mut body, load(&parameter), loc);
        guard(&mut updater, env, &mut body, &mut block_id, state);
    }
    let state = emit(&mut updater, env, &mut body, load(&parameter), loc);
    let root = copy_of(&mut updater, env, &mut body, state);
    let mut current = root.clone();
    for (index, element) in mutation.path.iter().enumerate() {
        // `const child = copyForUpdate(current[element]); current[element] = child;`
        let object = emit(&mut updater, env, &mut body, load(&current), loc);
        let value = match element {
            PathElement::Property(property) => InstructionValue::PropertyLoad {
                object,
                property: property.clone(),
                loc,
            },
            PathElement::Computed(key) => {
                let property = emit(
                    &mut updater,
                    env,
                    &mut body,
                    sources[&key.identifier].clone(),
                    loc,
                );
                InstructionValue::ComputedLoad {
                    object,
                    property,
                    loc,
                }
            }
        };
        let mut value = emit(&mut updater, env, &mut body, value, loc);
        if mutation.guards.contains(&(index + 1)) {
            // `const value = current[element]; if (value == null) return state;`
            let variable = promoted_variable(env, loc);
            emit(
                &mut updater,
                env,
                &mut body,
                InstructionValue::StoreLocal {
                    lvalue: LValue {
                        place: variable.clone(),
                        kind: InstructionKind::Const,
                    },
                    value,
                    type_annotation: None,
                    loc,
                },
                loc,
            );
            let tested = emit(&mut updater, env, &mut body, load(&variable), loc);
            guard(&mut updater, env, &mut body, &mut block_id, tested);
            value = emit(&mut updater, env, &mut body, load(&variable), loc);
        }
        let child = copy_of(&mut updater, env, &mut body, value);

        let object = emit(&mut updater, env, &mut body, load(&current), loc);
        let stored = emit(&mut updater, env, &mut body, load(&child), loc);
        let store = match element {
            PathElement::Property(property) => InstructionValue::PropertyStore {
                object,
                property: property.clone(),
                value: stored,
                loc,
            },
            PathElement::Computed(key) => {
                let property = emit(
                    &mut updater,
                    env,
                    &mut body,
                    sources[&key.identifier].clone(),
                    loc,
                );
                InstructionValue::ComputedStore {
                    object,
                    property,
                    value: stored,
                    loc,
                }
            }
        };
        emit(&mut updater, env, &mut body, store, loc);
        current = child;
    }

    let target = emit(&mut updater, env, &mut body, load(&current), loc);
    let captured =
        |updater: &mut HirFunction,
         env: &mut Environment,
         body: &mut Vec<InstructionId>,
         place: &Place|
         -> Place { emit(updater, env, body, sources[&place.identifier].clone(), loc) };
    let op = match &mutation.op {
        MutationOp::PropertyStore { property, value } => InstructionValue::PropertyStore {
            object: target,
            property: property.clone(),
            value: captured(&mut updater, env, &mut body, value),
            loc,
        },
        MutationOp::ComputedStore { property, value } => {
            let property = captured(&mut updater, env, &mut body, property);
            let value = captured(&mut updater, env, &mut body, value);
            InstructionValue::ComputedStore {
                object: target,
                property,
                value,
                loc,
            }
        }
        MutationOp::PropertyDelete { property } => InstructionValue::PropertyDelete {
            object: target,
            property: property.clone(),
            loc,
        },
        MutationOp::ComputedDelete { property } => InstructionValue::ComputedDelete {
            object: target,
            property: captured(&mut updater, env, &mut body, property),
            loc,
        },
        MutationOp::MethodCall { method, args } => {
            let property = emit(
                &mut updater,
                env,
                &mut body,
                InstructionValue::PropertyLoad {
                    object: target.clone(),
                    property: method.clone(),
                    loc,
                },
                loc,
            );
            let mut call_args: Vec<PlaceOrSpread> = Vec::new();
            for arg in args {
                call_args.push(match arg {
                    PlaceOrSpread::Place(place) => {
                        PlaceOrSpread::Place(captured(&mut updater, env, &mut body, place))
                    }
                    PlaceOrSpread::Spread(spread) => {
                        PlaceOrSpread::Spread(react_compiler_hir::SpreadPattern {
                            place: captured(&mut updater, env, &mut body, &spread.place),
                        })
                    }
                });
            }
            InstructionValue::MethodCall {
                receiver: target,
                property,
                args: call_args,
                loc,
            }
        }
    };
    emit(&mut updater, env, &mut body, op, loc);
    let result = emit(&mut updater, env, &mut body, load(&root), loc);

    updater.body.entry = entry;
    for block in finished {
        updater.body.blocks.insert(block.id, block);
    }
    updater.body.blocks.insert(
        block_id,
        BasicBlock {
            kind: BlockKind::Block,
            id: block_id,
            instructions: body,
            terminal: Terminal::Return {
                value: result,
                return_variant: ReturnVariant::Explicit,
                id: EvaluationOrder(0),
                loc,
                effects: None,
            },
            preds: Default::default(),
            phis: Vec::new(),
        },
    );
    mark_predecessors(&mut updater.body);
    Ok(env.add_function(updater))
}

// =============================================================================
// Event handlers
// =============================================================================

/// The functions that are only used as an event handler of a host element
/// (`<button onClick={() => count++}>`). React DOM registers every `on*` prop of
/// a host element as an event listener and ignores what the listener returns.
fn host_event_handlers(outer: &HirFunction, env: &Environment) -> Vec<FunctionId> {
    fn visit(func: &HirFunction, env: &Environment, handlers: &mut Vec<FunctionId>) {
        let uses = use_counts(func, env);
        let mut function_values: FxHashMap<IdentifierId, FunctionId> = FxHashMap::default();
        for block in func.body.blocks.values() {
            for instr_id in &block.instructions {
                let instr = &func.instructions[instr_id.0 as usize];
                match &instr.value {
                    InstructionValue::FunctionExpression { lowered_func, .. } => {
                        function_values.insert(instr.lvalue.identifier, lowered_func.func);
                        visit(&env.functions[lowered_func.func.0 as usize], env, handlers);
                    }
                    InstructionValue::ObjectMethod { lowered_func, .. } => {
                        visit(&env.functions[lowered_func.func.0 as usize], env, handlers);
                    }
                    InstructionValue::JsxExpression {
                        tag: react_compiler_hir::JsxTag::Builtin(_),
                        props,
                        ..
                    } => {
                        for prop in props {
                            let react_compiler_hir::JsxAttribute::Attribute { name, place } = prop
                            else {
                                continue;
                            };
                            let is_event = name.len() > 2
                                && name.starts_with("on")
                                && name[2..].starts_with(|c: char| c.is_ascii_uppercase());
                            if !is_event || uses.get(&place.identifier) != Some(&1) {
                                continue;
                            }
                            if let Some(function) = function_values.get(&place.identifier) {
                                handlers.push(*function);
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    let mut handlers = Vec::new();
    visit(outer, env, &mut handlers);
    handlers
}

/// `() => expr` becomes `() => { expr; }`.
fn discard_implicit_return(func: &mut HirFunction, env: &mut Environment) {
    let block_ids: Vec<BlockId> = func.body.blocks.keys().copied().collect();
    for block_id in block_ids {
        let Terminal::Return {
            return_variant: ReturnVariant::Implicit,
            ..
        } = &func.body.blocks[&block_id].terminal
        else {
            continue;
        };
        let (id, undefined) = add_temporary(
            func,
            env,
            InstructionValue::Primitive {
                value: react_compiler_hir::PrimitiveValue::Undefined,
                loc: None,
            },
            None,
        );
        let block = func.body.blocks.get_mut(&block_id).unwrap();
        block.instructions.push(id);
        if let Terminal::Return {
            value,
            return_variant,
            ..
        } = &mut block.terminal
        {
            *value = undefined;
            *return_variant = ReturnVariant::Void;
        }
    }
}

// =============================================================================
// Contexts
// =============================================================================

/// Updates the captured variables of every nested function for the `tracked`
/// identifiers (state variables, setters and shadows): a function captures the
/// ones that it or a function nested in it uses, unless it declares them.
fn fix_contexts(
    outer: &HirFunction,
    env: &mut Environment,
    tracked: &FxHashSet<IdentifierId>,
    shadows: &FxHashMap<IdentifierId, FunctionId>,
) {
    fn visit(
        func: &HirFunction,
        env: &mut Environment,
        tracked: &FxHashSet<IdentifierId>,
        shadows: &FxHashMap<IdentifierId, FunctionId>,
    ) -> Vec<IdentifierId> {
        let mut used: Vec<IdentifierId> = Vec::new();
        let add = |identifier: IdentifierId, used: &mut Vec<IdentifierId>| {
            if tracked.contains(&identifier) && !used.contains(&identifier) {
                used.push(identifier);
            }
        };
        for block in func.body.blocks.values() {
            for instr_id in &block.instructions {
                let instr = &func.instructions[instr_id.0 as usize];
                match &instr.value {
                    InstructionValue::FunctionExpression { lowered_func, .. }
                    | InstructionValue::ObjectMethod { lowered_func, .. } => {
                        let nested_id = lowered_func.func;
                        let nested = std::mem::replace(
                            &mut env.functions[nested_id.0 as usize],
                            placeholder_function(),
                        );
                        let mut nested_used = visit(&nested, env, tracked, shadows);
                        env.functions[nested_id.0 as usize] = nested;
                        nested_used
                            .retain(|identifier| shadows.get(identifier) != Some(&nested_id));

                        let context = &mut env.functions[nested_id.0 as usize].context;
                        context.retain(|place| {
                            !tracked.contains(&place.identifier)
                                || nested_used.contains(&place.identifier)
                        });
                        for identifier in &nested_used {
                            if !context.iter().any(|place| place.identifier == *identifier) {
                                context.push(place_of(*identifier));
                            }
                            add(*identifier, &mut used);
                        }
                    }
                    value => {
                        for place in visitors::each_instruction_value_operand(value, env) {
                            add(place.identifier, &mut used);
                        }
                        for place in visitors::each_instruction_value_lvalue(value) {
                            add(place.identifier, &mut used);
                        }
                    }
                }
            }
            for place in visitors::each_terminal_operand(&block.terminal) {
                add(place.identifier, &mut used);
            }
        }
        used
    }
    visit(outer, env, tracked, shadows);
}
