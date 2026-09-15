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
//! This pass runs after AnalyseFunctions (for callbacks with selections, see
//! below, `memoize_list_items_with_selections` runs before it). It only selects
//! the callbacks, calls the hook once per list at the start of the component
//! and makes the callback capture its result. The memo
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
//!   or its value is only rendered, as the items of a fixed position (see
//!   `jsx_block_positions`), for example `<ul>{items.map(...)}</ul>`: an
//!   unchanged item then returns the element of the previous render, and
//!   React bails out of rendering it,
//! - it has a single `return`, the returned element is created in the block
//!   of the `return` and no variable is reassigned after it, and neither the
//!   callback nor its nested functions access context variables, so memoized
//!   values can be computed right before the `return` without reading
//!   different values.
//!
//! The hook is called unconditionally at the start of the component and is
//! typed as a custom hook, so no memoization scope of the component contains it.
//!
//! Selections. A value that the callback captures from the component and uses
//! only as an operand of `===` or `!==` in its own body (such as `selectedId`
//! in `item.id === selectedId`) is a *selection*. The comparisons become calls
//! of `listItemCache.is(index, comparand)`, which evaluate the same comparison
//! against the value passed to `listItemCache.map`, and the `.map` call becomes
//! `listItemCache.map(items, callback, [selections])`. The callback no longer
//! captures the selections, so its memoization no longer depends on them.
//! When only selections changed, `map` calls the callback only for the items
//! whose comparisons can have a different result, and records which items it
//! replaced for the renderer (see ListItemMemoCache in react/compiler-runtime).
//!
//! A captured value is a selection only if every read of it is a `LoadLocal`
//! in the callback's own body whose single use is one side of a `===` or `!==`,
//! and the other side is not a read of a captured value. Reads in nested
//! functions (which could run later, with another selection) or any other use
//! exclude it.
//!
//! Callbacks with selections are rewritten before AnalyseFunctions, so that
//! their effects (and the effects of the component's `map` call) are inferred
//! from the rewritten code like any other code. The other callbacks are
//! handled after AnalyseFunctions, whose dead code elimination would otherwise
//! remove the cache from the context of a callback that does not read it yet
//! (its reads are generated with the callback's code).

use rustc_hash::{FxHashMap, FxHashSet};

use react_compiler_hir::environment::Environment;
use react_compiler_hir::object_shape::BUILT_IN_ARRAY_ID;
use react_compiler_hir::visitors;
use react_compiler_hir::{
    ArrayElement, BinaryOperator, BlockId, Effect, EvaluationOrder, FloatValue,
    FunctionExpressionType, FunctionId, HirFunction, IdentifierId, IdentifierName, Instruction,
    InstructionId, InstructionKind, InstructionValue, LValue, NonLocalBinding, ParamPattern, Place,
    PlaceOrSpread, PrimitiveValue, PropertyLiteral, ReactFunctionType, Terminal, Type,
    UnaryOperator,
};
use react_compiler_lowering::{create_temporary_place, mark_instruction_ids};
use react_compiler_ssa::enter_ssa::placeholder_function;

/// A `.map` call whose callback is memoized per item.
struct Site {
    callback: FunctionId,
    /// The block and instruction of the `.map` call.
    block: BlockId,
    call: InstructionId,
    /// The callback's selections, in the order they are passed to `map`.
    selections: Vec<Selection>,
}

/// A value captured by a list item callback and only compared with `===` or
/// `!==` in its body.
struct Selection {
    /// The captured identifier.
    identifier: IdentifierId,
    /// The callback's reads of it (`LoadLocal` instructions).
    loads: Vec<InstructionId>,
    /// The comparisons that use those reads.
    comparisons: Vec<InstructionId>,
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
    memoize_sites(func, env, hook_binding, false)
}

/// Like `memoize_list_items`, for the callbacks with selections. Runs before
/// AnalyseFunctions.
pub fn memoize_list_items_with_selections(
    func: &mut HirFunction,
    env: &mut Environment,
    hook_binding: &mut dyn FnMut() -> NonLocalBinding,
) -> usize {
    memoize_sites(func, env, hook_binding, true)
}

fn memoize_sites(
    func: &mut HirFunction,
    env: &mut Environment,
    hook_binding: &mut dyn FnMut() -> NonLocalBinding,
    with_selections: bool,
) -> usize {
    if !matches!(
        func.fn_type,
        ReactFunctionType::Component | ReactFunctionType::Hook
    ) {
        return 0;
    }
    let sites: Vec<Site> = find_sites(func, env)
        .into_iter()
        .filter(|site| {
            // After AnalyseFunctions, every callback that is not memoized yet
            // is memoized without selections.
            (!with_selections || !site.selections.is_empty())
                && env.list_item_callback_cache(site.callback).is_none()
        })
        .collect();
    if sites.is_empty() {
        return 0;
    }
    let binding = hook_binding();

    let mut entry_instructions: Vec<InstructionId> = Vec::new();
    for site in &sites {
        let cache = emit_hook_call(func, env, &binding, &mut entry_instructions);
        if with_selections {
            read_selections_from_cache(env, site, &cache);
            map_with_selections(func, env, site, &cache);
        }
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
    // Callbacks of lists that are only rendered, as items of a fixed position
    // (see jsx_block_positions): their elements can be memoized whether or not
    // they are blocks.
    let rendered_callbacks = crate::jsx_block_positions::Positions::build(
        func,
        env,
        func.fn_type == ReactFunctionType::Component,
    )
    .rendered_list_callbacks();
    let mut sites = Vec::new();
    let mut seen: FxHashSet<FunctionId> = FxHashSet::default();
    for block in func.body.blocks.values() {
        for instr_id in &block.instructions {
            let instr = &func.instructions[instr_id.0 as usize];
            let InstructionValue::MethodCall { property, args, .. } = &instr.value else {
                continue;
            };
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
            // The list is rendered by a block slot and used nowhere else, with
            // blocks as items, or it is only rendered.
            let block_list = slot_values.contains(&instr.lvalue.identifier)
                && uses(instr.lvalue.identifier) == 1
                && env.is_block_function(callback);
            if !(block_list || rendered_callbacks.contains(&callback))
                || !seen.insert(callback)
                || !is_memoizable(&env.functions[callback.0 as usize], env)
            {
                continue;
            }
            sites.push(Site {
                callback,
                block: block.id,
                call: *instr_id,
                selections: find_selections(&env.functions[callback.0 as usize], env),
            });
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

/// The callback's selections (see the module documentation).
fn find_selections(callback: &HirFunction, env: &Environment) -> Vec<Selection> {
    let captured: FxHashSet<IdentifierId> = callback
        .context
        .iter()
        .map(|place| place.identifier)
        .collect();
    // Every use of each identifier, as the instruction (None for terminals and
    // phis) that uses it.
    let mut uses: FxHashMap<IdentifierId, Vec<Option<InstructionId>>> = FxHashMap::default();
    let mut defs: FxHashMap<IdentifierId, InstructionId> = FxHashMap::default();
    for block in callback.body.blocks.values() {
        for phi in &block.phis {
            for operand in phi.operands.values() {
                uses.entry(operand.identifier).or_default().push(None);
            }
        }
        for instr_id in &block.instructions {
            let instr = &callback.instructions[instr_id.0 as usize];
            defs.insert(instr.lvalue.identifier, *instr_id);
            match &instr.value {
                // Before AnalyseFunctions, the context of a nested function can
                // list captured values that its body does not read, so reads
                // are found in its body.
                InstructionValue::FunctionExpression { lowered_func, .. }
                | InstructionValue::ObjectMethod { lowered_func, .. } => {
                    let nested = &env.functions[lowered_func.func.0 as usize];
                    for place in &callback.context {
                        if function_reads(nested, env, place.identifier) {
                            uses.entry(place.identifier)
                                .or_default()
                                .push(Some(*instr_id));
                        }
                    }
                }
                value => {
                    for place in visitors::each_instruction_value_operand(value, env) {
                        uses.entry(place.identifier)
                            .or_default()
                            .push(Some(*instr_id));
                    }
                }
            }
        }
        for place in visitors::each_terminal_operand(&block.terminal) {
            uses.entry(place.identifier).or_default().push(None);
        }
    }
    let value = |instr_id: InstructionId| &callback.instructions[instr_id.0 as usize].value;
    let reads_captured = |id: IdentifierId| {
        defs.get(&id).is_some_and(|def| {
            matches!(value(*def), InstructionValue::LoadLocal { place, .. } if captured.contains(&place.identifier))
        })
    };

    let mut selections = Vec::new();
    // In context order, so that the output is deterministic.
    for place in &callback.context {
        let identifier = place.identifier;
        let Some(reads) = uses.get(&identifier) else {
            continue;
        };
        let mut selection = Selection {
            identifier,
            loads: Vec::new(),
            comparisons: Vec::new(),
        };
        let is_selection = reads.iter().all(|read| {
            let Some(load) = read else {
                return false;
            };
            let InstructionValue::LoadLocal { place, .. } = value(*load) else {
                return false;
            };
            if place.identifier != identifier {
                return false;
            }
            let temporary = callback.instructions[load.0 as usize].lvalue.identifier;
            let [Some(comparison)] = uses.get(&temporary).map(Vec::as_slice).unwrap_or(&[]) else {
                return false;
            };
            let InstructionValue::BinaryExpression {
                operator: BinaryOperator::StrictEqual | BinaryOperator::StrictNotEqual,
                left,
                right,
                ..
            } = value(*comparison)
            else {
                return false;
            };
            let comparand = if left.identifier == temporary {
                right
            } else {
                left
            };
            if comparand.identifier == temporary || reads_captured(comparand.identifier) {
                return false;
            }
            selection.loads.push(*load);
            selection.comparisons.push(*comparison);
            true
        });
        if is_selection && !selection.loads.is_empty() {
            selections.push(selection);
        }
    }
    selections
}

/// Whether the body of `func`, or of a function nested in it, reads
/// `identifier`.
fn function_reads(func: &HirFunction, env: &Environment, identifier: IdentifierId) -> bool {
    func.body.blocks.values().any(|block| {
        block.phis.iter().any(|phi| {
            phi.operands
                .values()
                .any(|place| place.identifier == identifier)
        }) || block.instructions.iter().any(|instr_id| {
            match &func.instructions[instr_id.0 as usize].value {
                InstructionValue::FunctionExpression { lowered_func, .. }
                | InstructionValue::ObjectMethod { lowered_func, .. } => function_reads(
                    &env.functions[lowered_func.func.0 as usize],
                    env,
                    identifier,
                ),
                value => visitors::each_instruction_value_operand(value, env)
                    .iter()
                    .any(|place| place.identifier == identifier),
            }
        }) || visitors::each_terminal_operand(&block.terminal)
            .iter()
            .any(|place| place.identifier == identifier)
    })
}

/// Removes `identifiers` from the context of the functions nested in `func`,
/// whose bodies do not read them.
fn remove_from_nested_contexts(
    func: &HirFunction,
    env: &mut Environment,
    identifiers: &FxHashSet<IdentifierId>,
) {
    for block in func.body.blocks.values() {
        for instr_id in &block.instructions {
            if let InstructionValue::FunctionExpression { lowered_func, .. }
            | InstructionValue::ObjectMethod { lowered_func, .. } =
                &func.instructions[instr_id.0 as usize].value
            {
                let nested_id = lowered_func.func;
                let nested = std::mem::replace(
                    &mut env.functions[nested_id.0 as usize],
                    placeholder_function(),
                );
                remove_from_nested_contexts(&nested, env, identifiers);
                env.functions[nested_id.0 as usize] = nested;
                env.functions[nested_id.0 as usize]
                    .context
                    .retain(|place| !identifiers.contains(&place.identifier));
            }
        }
    }
}

/// Replaces the comparisons of the callback's selections with
/// `cache.is(index, comparand)` and removes the selections from the callback.
fn read_selections_from_cache(env: &mut Environment, site: &Site, cache: &Place) {
    let mut removed_loads: FxHashSet<InstructionId> = FxHashSet::default();
    let mut replacements: FxHashMap<InstructionId, usize> = FxHashMap::default();
    let mut selected: FxHashSet<IdentifierId> = FxHashSet::default();
    for (index, selection) in site.selections.iter().enumerate() {
        removed_loads.extend(selection.loads.iter().copied());
        for comparison in &selection.comparisons {
            replacements.insert(*comparison, index);
        }
        selected.insert(selection.identifier);
    }
    let receiver = Place {
        effect: Effect::Read,
        ..cache.clone()
    };

    let mut callback = std::mem::replace(
        &mut env.functions[site.callback.0 as usize],
        placeholder_function(),
    );
    let block_ids: Vec<BlockId> = callback.body.blocks.keys().copied().collect();
    for block_id in block_ids {
        let old_instructions = std::mem::take(
            &mut callback
                .body
                .blocks
                .get_mut(&block_id)
                .unwrap()
                .instructions,
        );
        let mut instructions = Vec::with_capacity(old_instructions.len());
        for instr_id in old_instructions {
            if removed_loads.contains(&instr_id) {
                continue;
            }
            let Some(&selection_index) = replacements.get(&instr_id) else {
                instructions.push(instr_id);
                continue;
            };
            let (operator, left, right) = match &callback.instructions[instr_id.0 as usize].value {
                InstructionValue::BinaryExpression {
                    operator,
                    left,
                    right,
                    ..
                } => (*operator, left.clone(), right.clone()),
                _ => unreachable!("selection comparisons are binary expressions"),
            };
            let loads = &site.selections[selection_index].loads;
            let is_load = |place: &Place| {
                loads.iter().any(|load| {
                    callback.instructions[load.0 as usize].lvalue.identifier == place.identifier
                })
            };
            let comparand = if is_load(&left) { right } else { left };

            let method = create_temporary_place(env, None);
            set_type(env, method.identifier, Type::Poly);
            push_instruction(
                &mut callback,
                &mut instructions,
                method.clone(),
                InstructionValue::PropertyLoad {
                    object: receiver.clone(),
                    property: PropertyLiteral::String("is".to_string()),
                    loc: None,
                },
            );
            let index = create_temporary_place(env, None);
            set_type(env, index.identifier, Type::Primitive);
            push_instruction(
                &mut callback,
                &mut instructions,
                index.clone(),
                InstructionValue::Primitive {
                    value: PrimitiveValue::Number(FloatValue::new(selection_index as f64)),
                    loc: None,
                },
            );
            let call = InstructionValue::MethodCall {
                receiver: receiver.clone(),
                property: method,
                args: vec![PlaceOrSpread::Place(index), PlaceOrSpread::Place(comparand)],
                loc: None,
            };
            let comparison = &mut callback.instructions[instr_id.0 as usize];
            if operator == BinaryOperator::StrictEqual {
                comparison.value = call;
            } else {
                let result = create_temporary_place(env, None);
                set_type(env, result.identifier, Type::Primitive);
                push_instruction(&mut callback, &mut instructions, result.clone(), call);
                let comparison = &mut callback.instructions[instr_id.0 as usize];
                comparison.value = InstructionValue::UnaryExpression {
                    operator: UnaryOperator::Not,
                    value: result,
                    loc: None,
                };
            }
            instructions.push(instr_id);
        }
        callback
            .body
            .blocks
            .get_mut(&block_id)
            .unwrap()
            .instructions = instructions;
    }
    callback
        .context
        .retain(|place| !selected.contains(&place.identifier));
    remove_from_nested_contexts(&callback, env, &selected);
    mark_instruction_ids(&mut callback.body, &mut callback.instructions);
    env.functions[site.callback.0 as usize] = callback;
}

/// Replaces `items.map(callback)` with `cache.map(items, callback, [selections])`.
fn map_with_selections(func: &mut HirFunction, env: &mut Environment, site: &Site, cache: &Place) {
    let (items, callback) = match &func.instructions[site.call.0 as usize].value {
        InstructionValue::MethodCall { receiver, args, .. } => {
            let [PlaceOrSpread::Place(callback)] = args.as_slice() else {
                unreachable!("list item callbacks are the only argument of `.map`");
            };
            (receiver.clone(), callback.clone())
        }
        _ => unreachable!("list item sites are method calls"),
    };
    let receiver = Place {
        effect: Effect::Read,
        ..cache.clone()
    };
    let mut inserted = Vec::new();
    let method = create_temporary_place(env, None);
    set_type(env, method.identifier, Type::Poly);
    push_instruction(
        func,
        &mut inserted,
        method.clone(),
        InstructionValue::PropertyLoad {
            object: receiver.clone(),
            property: PropertyLiteral::String("map".to_string()),
            loc: None,
        },
    );
    let selections = create_temporary_place(env, None);
    set_type(
        env,
        selections.identifier,
        Type::Object {
            shape_id: Some(BUILT_IN_ARRAY_ID.to_string()),
        },
    );
    push_instruction(
        func,
        &mut inserted,
        selections.clone(),
        InstructionValue::ArrayExpression {
            elements: site
                .selections
                .iter()
                .map(|selection| {
                    ArrayElement::Place(Place {
                        identifier: selection.identifier,
                        effect: Effect::Unknown,
                        reactive: false,
                        loc: None,
                    })
                })
                .collect(),
            loc: None,
        },
    );
    let call = &mut func.instructions[site.call.0 as usize];
    call.value = InstructionValue::MethodCall {
        receiver,
        property: method,
        args: vec![
            PlaceOrSpread::Place(items),
            PlaceOrSpread::Place(callback),
            PlaceOrSpread::Place(selections),
        ],
        loc: call.value.loc().cloned(),
    };
    let block = func.body.blocks.get_mut(&site.block).expect("site block");
    let position = block
        .instructions
        .iter()
        .position(|id| *id == site.call)
        .expect("the call is in its block");
    block.instructions.splice(position..position, inserted);
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
