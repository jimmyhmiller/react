// Copyright (c) Meta Platforms, Inc. and affiliates.
//
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.

//! Memoizes each item of a list rendered by a `.map` callback.
//!
//! The compiler does not memoize values inside callbacks, so every render of a
//! list recreates every item's element, values and event handlers, even when
//! only one item changed. For a callback whose items are compiled blocks
//! rendered without fibers, this pass gives the callback a memo cache per item:
//!
//! ```text
//! function List({items, selected}) {
//!   const listItemCache = useListItemMemoCache();
//!   return <ul>{items.map(item => {
//!     const $ = listItemCache.next(N);
//!     ...derived values...
//!     if ($[0] !== dep0 || ...) { t = <Block key={..} v={[...]} />; ... } else { t = $[..]; }
//!     return t;
//!   })}</ul>;
//! }
//! ```
//!
//! This pass runs after AnalyseFunctions. It only selects the callbacks, calls
//! the hook once per list at the start of the component and makes the callback
//! capture its result. The memo
//! scope inside the callback is built right before the callback's code is
//! generated (`memoize_list_item_body` in react_compiler_reactive_scopes).
//!
//! `unstable_useListItemMemoCache` (react/compiler-runtime) gives the n-th
//! call of a render the memo cache of the n-th call of the previous render.
//! Every memoized output is guarded by its inputs, so reusing a cache for a
//! different item only costs a recomputation.
//!
//! A callback is selected only if:
//! - it is an arrow function (no own `this` or `arguments`) that does not read
//!   `arguments`, and is not async or a generator,
//! - its value is rendered by a block slot and each of its items is a block
//!   (see `CompileJsxBlocks`; items that need fibers get them individually),
//! - it has a single `return`, the returned element is created in the block
//!   of the `return` and no variable is reassigned after it, and neither the
//!   callback nor its nested functions access context variables, so memoized
//!   values can be computed right before the `return` without reading
//!   different values.
//!
//! The hook is called unconditionally at the start of the component and is
//! typed as a custom hook, so no memoization scope of the component contains it.

use rustc_hash::{FxHashMap, FxHashSet};

use react_compiler_hir::environment::Environment;
use react_compiler_hir::visitors;
use react_compiler_hir::{
    Effect, EvaluationOrder, FunctionExpressionType, FunctionId, HirFunction, IdentifierId,
    IdentifierName, Instruction, InstructionId, InstructionKind, InstructionValue, LValue,
    NonLocalBinding, ParamPattern, Place, PlaceOrSpread, PropertyLiteral, ReactFunctionType,
    Terminal, Type,
};
use react_compiler_lowering::{create_temporary_place, mark_instruction_ids};

/// A `.map` call whose callback is memoized per item.
struct Site {
    callback: FunctionId,
}

/// Memoize the item callbacks of lists in the component or hook `func`.
/// `hook_binding` is called once if any list is memoized and returns the
/// module binding of `unstable_useListItemMemoCache`. Returns the number of
/// memoized lists.
pub fn memoize_list_items(
    func: &mut HirFunction,
    env: &mut Environment,
    hook_binding: &mut dyn FnMut() -> NonLocalBinding,
) -> usize {
    if !matches!(
        func.fn_type,
        ReactFunctionType::Component | ReactFunctionType::Hook
    ) {
        return 0;
    }
    let sites = find_sites(func, env);
    if sites.is_empty() {
        return 0;
    }
    let binding = hook_binding();

    let mut entry_instructions: Vec<InstructionId> = Vec::new();
    for site in &sites {
        let cache = emit_hook_call(func, env, &binding, &mut entry_instructions);
        // The callback reads the cache (see memoize_list_item_body).
        env.functions[site.callback.0 as usize].context.push(Place {
            effect: Effect::Read,
            ..cache.clone()
        });
        env.add_list_item_callback(site.callback, cache.identifier);
    }
    let entry = func.body.entry;
    let block = func.body.blocks.get_mut(&entry).expect("entry block");
    entry_instructions.append(&mut block.instructions);
    block.instructions = entry_instructions;
    mark_instruction_ids(&mut func.body, &mut func.instructions);
    sites.len()
}

fn find_sites(func: &HirFunction, env: &Environment) -> Vec<Site> {
    let mut use_counts: FxHashMap<IdentifierId, usize> = FxHashMap::default();
    let mut defs: FxHashMap<IdentifierId, InstructionId> = FxHashMap::default();
    for block in func.body.blocks.values() {
        for phi in &block.phis {
            for operand in phi.operands.values() {
                *use_counts.entry(operand.identifier).or_default() += 1;
            }
        }
        for instr_id in &block.instructions {
            let instr = &func.instructions[instr_id.0 as usize];
            defs.insert(instr.lvalue.identifier, *instr_id);
            for place in visitors::each_instruction_value_operand(&instr.value, env) {
                *use_counts.entry(place.identifier).or_default() += 1;
            }
        }
        for place in visitors::each_terminal_operand(&block.terminal) {
            *use_counts.entry(place.identifier).or_default() += 1;
        }
    }
    let uses = |id: IdentifierId| use_counts.get(&id).copied().unwrap_or(0);
    let def = |id: IdentifierId| {
        defs.get(&id)
            .map(|instr_id| &func.instructions[instr_id.0 as usize].value)
    };

    let slot_values = env.block_slot_values();
    let mut sites = Vec::new();
    let mut seen: FxHashSet<FunctionId> = FxHashSet::default();
    for block in func.body.blocks.values() {
        for instr_id in &block.instructions {
            let instr = &func.instructions[instr_id.0 as usize];
            let InstructionValue::MethodCall { property, args, .. } = &instr.value else {
                continue;
            };
            // The list is rendered by a block slot, and used nowhere else.
            if !slot_values.contains(&instr.lvalue.identifier) || uses(instr.lvalue.identifier) != 1
            {
                continue;
            }
            if !matches!(
                def(property.identifier),
                Some(InstructionValue::PropertyLoad {
                    property: PropertyLiteral::String(name),
                    ..
                }) if name == "map"
            ) {
                continue;
            }
            let [PlaceOrSpread::Place(callback_place)] = args.as_slice() else {
                continue;
            };
            if uses(callback_place.identifier) != 1 {
                continue;
            }
            let Some(InstructionValue::FunctionExpression {
                lowered_func,
                expr_type: FunctionExpressionType::ArrowFunctionExpression,
                ..
            }) = def(callback_place.identifier)
            else {
                continue;
            };
            let callback = lowered_func.func;
            if !env.is_block_function(callback)
                || !seen.insert(callback)
                || !is_memoizable(&env.functions[callback.0 as usize], env)
            {
                continue;
            }
            sites.push(Site { callback });
        }
    }
    sites
}

/// Whether a callback has the shape required by `memoize_list_item_body`.
fn is_memoizable(callback: &HirFunction, env: &Environment) -> bool {
    if callback.is_async || callback.generator {
        return false;
    }
    if callback
        .params
        .iter()
        .any(|param| matches!(param, ParamPattern::Spread(_)))
    {
        return false;
    }
    let return_blocks: Vec<&react_compiler_hir::BasicBlock> = callback
        .body
        .blocks
        .values()
        .filter(|block| matches!(block.terminal, Terminal::Return { .. }))
        .collect();
    let [return_block] = return_blocks.as_slice() else {
        return false;
    };
    if uses_context_or_arguments(callback, env) {
        return false;
    }
    // The returned element's allocations are moved right before the return, so
    // no variable may be reassigned after the element is created. Every other
    // block runs before the return block, so reassignments there come first.
    let Terminal::Return { value, .. } = &return_block.terminal else {
        return false;
    };
    let mut returned = value.identifier;
    let mut element_index: Option<usize> = None;
    for (index, instr_id) in return_block.instructions.iter().enumerate().rev() {
        let instr = &callback.instructions[instr_id.0 as usize];
        if instr.lvalue.identifier != returned {
            continue;
        }
        match &instr.value {
            InstructionValue::LoadLocal { place, .. } => returned = place.identifier,
            InstructionValue::JsxExpression { .. } => {
                element_index = Some(index);
                break;
            }
            _ => return false,
        }
    }
    let Some(element_index) = element_index else {
        return false;
    };
    return_block.instructions[element_index..]
        .iter()
        .all(|instr_id| !is_reassignment(&callback.instructions[instr_id.0 as usize].value))
}

fn is_reassignment(value: &InstructionValue) -> bool {
    match value {
        InstructionValue::StoreLocal { lvalue, .. }
        | InstructionValue::DeclareLocal { lvalue, .. } => lvalue.kind == InstructionKind::Reassign,
        InstructionValue::Destructure { lvalue, .. } => lvalue.kind == InstructionKind::Reassign,
        InstructionValue::PrefixUpdate { .. } | InstructionValue::PostfixUpdate { .. } => true,
        _ => false,
    }
}

/// Whether `func` or a function nested in it accesses a context variable (a
/// captured variable that is reassigned somewhere, whose value when an
/// allocation runs could differ) or reads `arguments`.
fn uses_context_or_arguments(func: &HirFunction, env: &Environment) -> bool {
    for block in func.body.blocks.values() {
        for instr_id in &block.instructions {
            let instr = &func.instructions[instr_id.0 as usize];
            match &instr.value {
                InstructionValue::LoadContext { .. }
                | InstructionValue::StoreContext { .. }
                | InstructionValue::DeclareContext { .. } => return true,
                InstructionValue::LoadGlobal {
                    binding: NonLocalBinding::Global { name },
                    ..
                } if name == "arguments" => return true,
                InstructionValue::FunctionExpression { lowered_func, .. }
                | InstructionValue::ObjectMethod { lowered_func, .. } => {
                    if uses_context_or_arguments(&env.functions[lowered_func.func.0 as usize], env)
                    {
                        return true;
                    }
                }
                _ => {}
            }
        }
    }
    false
}

fn push_instruction(
    func: &mut HirFunction,
    instructions: &mut Vec<InstructionId>,
    lvalue: Place,
    value: InstructionValue,
) {
    let id = InstructionId(func.instructions.len() as u32);
    func.instructions.push(Instruction {
        id: EvaluationOrder(0),
        loc: None,
        lvalue,
        value,
        effects: None,
    });
    instructions.push(id);
}

/// Emits `const listItemCache = useListItemMemoCache()` and returns the place
/// of the named variable.
fn emit_hook_call(
    func: &mut HirFunction,
    env: &mut Environment,
    binding: &NonLocalBinding,
    instructions: &mut Vec<InstructionId>,
) -> Place {
    // Later passes decide call effects and scopes from the callee's type, which
    // InferTypes has already assigned for existing instructions.
    let hook_type = env
        .get_global_declaration(binding, None)
        .ok()
        .flatten()
        .expect("a hook-named module binding has a custom hook type");
    let return_type = match &hook_type {
        Type::Function { return_type, .. } => (**return_type).clone(),
        _ => Type::Poly,
    };

    let callee = create_temporary_place(env, None);
    set_type(env, callee.identifier, hook_type);
    push_instruction(
        func,
        instructions,
        callee.clone(),
        InstructionValue::LoadGlobal {
            binding: binding.clone(),
            loc: None,
        },
    );
    let result = create_temporary_place(env, None);
    set_type(env, result.identifier, return_type.clone());
    push_instruction(
        func,
        instructions,
        result.clone(),
        InstructionValue::CallExpression {
            callee,
            args: Vec::new(),
            loc: None,
        },
    );
    let cache = create_temporary_place(env, None);
    let name = env.generate_globally_unique_identifier_name(Some("listItemCache"));
    env.identifiers[cache.identifier.0 as usize].name = Some(IdentifierName::Named(name));
    set_type(env, cache.identifier, return_type);
    let store_lvalue = create_temporary_place(env, None);
    push_instruction(
        func,
        instructions,
        store_lvalue,
        InstructionValue::StoreLocal {
            lvalue: LValue {
                place: cache.clone(),
                kind: InstructionKind::Const,
            },
            value: result,
            type_annotation: None,
            loc: None,
        },
    );
    cache
}

fn set_type(env: &mut Environment, id: IdentifierId, ty: Type) {
    let type_id = env.identifiers[id.0 as usize].type_;
    env.types[type_id.0 as usize] = ty;
}
