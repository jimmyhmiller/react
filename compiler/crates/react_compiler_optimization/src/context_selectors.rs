// Copyright (c) Meta Platforms, Inc. and affiliates.
//
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.

//! Selected context reads (`enableContextSelectors`).
//!
//! When a context value changes, React renders every component that read the
//! context. A component whose render only depends on some values of the
//! context (`value.selectedId === id`, `value.theme`) renders the same output
//! if those values did not change, so rendering it is unobservable work
//! (render being pure). This pass describes, for each context read, the values
//! the component's render depends on, and passes the description to React:
//!
//! ```text
//! const {selectedId, dispatch} = useContext(Board);
//! const isSelected = card.id === selectedId;
//! // becomes
//! const {selectedId, dispatch} = useContextPaths(Board, [[1, card.id, "selectedId"], [0, "dispatch"]]);
//! ```
//!
//! Each entry of the description is `[0, ...keys]` (the value at a path of the
//! context value) or `[1, operand, ...keys]` (whether that value is `===
//! operand`; `!==` is its negation). React calls the description's selector
//! with a new context value and renders the component only if a selected
//! value differs (react/compiler-runtime `unstable_useContextPaths`).
//!
//! The description covers every read of the context value by the function,
//! including reads by functions it creates (event handlers keep the value of
//! the render that created them, so the values they read must not change
//! without a render). A value read through a path is followed through local
//! variables, destructuring and property loads. Any other use of a value (a
//! call argument, a JSX attribute, a return, a method call, a phi) selects the
//! whole value at that path; such a use of the context value itself makes the
//! read unselected. Computed keys and comparison operands must have the same
//! value when the context is read: they are constants, values computed before
//! the read, or property reads of parameters (props are frozen), which are
//! re-evaluated before the read.
//!
//! Custom hooks. A read `const v = useX(...)` of a custom hook is selected the
//! same way, through `unstable_startSelectedHook(useX)` and
//! `unstable_selectHookPaths`, and React only applies the description if `useX`
//! is registered as a context hook and the call read exactly one context,
//! called no other hook, and returned the context value. A hook is registered
//! (`unstable_registerContextHook`) by the module that defines it when this
//! pass verifies that it returns the value of its one `useContext` call for
//! every value of the context (or throws): its only hook call is `useContext`
//! and every `return` returns that value.
//!
//! The same call is selected for hooks of external stores (like Zustand's
//! `create` hooks and React Redux's `useSelector`), which return a selection
//! of the store's state: React applies the description if the hook is
//! registered as a store hook (see `store_hooks` in the react_compiler crate)
//! and the call read exactly one `useSyncExternalStore` and returned its
//! snapshot. `const selectedId = useStore(s => s.selectedId); selectedId ===
//! id` is described as `[[1, id]]`.
//!
//! Selector reads (`enableSelectorReads`). When the first argument of a custom
//! hook call is an inline function whose first parameter (the store's state)
//! is only read through static property loads and destructuring, the call is
//! made through the runtime with the top-level keys it reads:
//! `useStore(s => s.rows[id])` passes `["rows"]` to
//! `unstable_selectHookPaths`, even if the returned value is not selected.
//! React uses the keys for store hooks registered with a state getter, which
//! promise that their snapshot is their first argument applied to the state:
//! a store change only checks the calls that read a changed key.

use rustc_hash::{FxHashMap, FxHashSet};

use react_compiler_hir::dominator::compute_unconditional_blocks;
use react_compiler_hir::environment::Environment;
use react_compiler_hir::object_shape::HookKind;
use react_compiler_hir::visitors;
use react_compiler_hir::{
    ArrayElement, BinaryOperator, BlockId, EvaluationOrder, FloatValue, FunctionId, HirFunction,
    IdentifierId, Instruction, InstructionId, InstructionKind, InstructionValue, NonLocalBinding,
    ObjectPropertyKey, ObjectPropertyOrSpread, ObjectPropertyType, ParamPattern, Pattern, Place,
    PlaceOrSpread, PrimitiveValue, PropertyLiteral, ReactFunctionType, Terminal, Type,
};
use react_compiler_lowering::{create_temporary_place, mark_instruction_ids};

/// The runtime functions the rewritten code calls, provided by the caller
/// (they are imported from react/compiler-runtime).
pub trait ContextSelectorImports {
    fn use_context_paths(&mut self) -> NonLocalBinding;
    fn use_context_key(&mut self) -> NonLocalBinding;
    fn start_selected_hook(&mut self) -> NonLocalBinding;
    fn select_hook_paths(&mut self) -> NonLocalBinding;
    /// `unstable_skipStoreHookN` for a call with `argument_count` (at most
    /// `MAX_SLICED_HOOK_ARGUMENTS`) arguments.
    fn skip_store_hook(&mut self, argument_count: usize) -> NonLocalBinding;
}

/// The most arguments of a hook call that update slicing calls through the
/// runtime (`unstable_skipStoreHook0` to `unstable_skipStoreHook3`).
const MAX_SLICED_HOOK_ARGUMENTS: usize = 3;

/// Rewrites the selectable context reads of a component or hook. With
/// `update_slicing`, every call of a custom hook (selected or not) is also made
/// through the runtime (see "Update slicing" above). Returns the number of
/// rewritten reads and calls.
pub fn select_context_reads(
    func: &mut HirFunction,
    env: &mut Environment,
    imports: &mut dyn ContextSelectorImports,
    update_slicing: bool,
    selector_reads_enabled: bool,
) -> usize {
    if !matches!(
        func.fn_type,
        ReactFunctionType::Component | ReactFunctionType::Hook
    ) {
        return 0;
    }
    let Ok(unconditional) = compute_unconditional_blocks(func, env.next_block_id_counter) else {
        return 0;
    };
    let sites = find_sites(func, env);
    if sites.is_empty() {
        return 0;
    }
    let index = FunctionIndex::build(func, env, &unconditional);
    let mut plans = Vec::new();
    for site in sites {
        let entries = analyze(func, env, &index, &site);
        let sliced = update_slicing
            && site.kind == SiteKind::Hook
            && site.argument_count <= MAX_SLICED_HOOK_ARGUMENTS;
        let reads = if selector_reads_enabled && site.kind == SiteKind::Hook {
            selector_reads(func, env, &index, &site)
        } else {
            None
        };
        if entries.is_some() || sliced || reads.is_some() {
            plans.push((site, entries, sliced, reads));
        }
    }
    let count = plans.len();
    for (site, entries, sliced, reads) in plans {
        rewrite(
            func,
            env,
            imports,
            &site,
            entries.as_deref(),
            sliced,
            reads.as_deref(),
        );
    }
    if count > 0 {
        mark_instruction_ids(&mut func.body, &mut func.instructions);
    }
    count
}

/// Whether a hook returns the value of its one `useContext` call, for every
/// value of the context, or throws (see the module documentation).
pub fn is_context_identity_hook(func: &HirFunction, env: &Environment) -> bool {
    if func.fn_type != ReactFunctionType::Hook || func.is_async || func.generator {
        return false;
    }
    let mut context_value: Option<IdentifierId> = None;
    let mut sources: FxHashMap<IdentifierId, IdentifierId> = FxHashMap::default();
    for block in func.body.blocks.values() {
        for instr_id in &block.instructions {
            let instr = &func.instructions[instr_id.0 as usize];
            match &instr.value {
                InstructionValue::CallExpression { callee, args, .. }
                | InstructionValue::MethodCall {
                    property: callee,
                    args,
                    ..
                } => match hook_kind(env, callee.identifier) {
                    // `useContext(Ctx)` or `React.useContext(Ctx)`.
                    Some(HookKind::UseContext) if context_value.is_none() && args.len() == 1 => {
                        context_value = Some(instr.lvalue.identifier);
                    }
                    Some(_) => return false,
                    None => {}
                },
                InstructionValue::LoadLocal { place, .. } => {
                    sources.insert(instr.lvalue.identifier, place.identifier);
                }
                InstructionValue::StoreLocal { lvalue, value, .. }
                    if lvalue.kind != InstructionKind::Reassign =>
                {
                    sources.insert(lvalue.place.identifier, value.identifier);
                }
                InstructionValue::TypeCastExpression { value, .. } => {
                    sources.insert(instr.lvalue.identifier, value.identifier);
                }
                _ => {}
            }
        }
    }
    let Some(context_value) = context_value else {
        return false;
    };
    let mut returns = 0;
    for block in func.body.blocks.values() {
        match &block.terminal {
            Terminal::Return { value, .. } => {
                let mut id = value.identifier;
                let mut steps = 0;
                while id != context_value {
                    match sources.get(&id) {
                        Some(source) if steps < 64 => {
                            id = *source;
                            steps += 1;
                        }
                        _ => return false,
                    }
                }
                returns += 1;
            }
            Terminal::Throw { .. } => {}
            _ => {}
        }
    }
    returns > 0
}

fn hook_kind(env: &Environment, id: IdentifierId) -> Option<HookKind> {
    env.get_hook_kind_for_id(id).ok().flatten().cloned()
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum SiteKind {
    Context,
    Hook,
}

struct Site {
    kind: SiteKind,
    block: BlockId,
    instruction: InstructionId,
    value: IdentifierId,
    argument_count: usize,
}

fn find_sites(func: &HirFunction, env: &Environment) -> Vec<Site> {
    let mut load_globals: FxHashSet<IdentifierId> = FxHashSet::default();
    for block in func.body.blocks.values() {
        for instr_id in &block.instructions {
            let instr = &func.instructions[instr_id.0 as usize];
            if matches!(instr.value, InstructionValue::LoadGlobal { .. }) {
                load_globals.insert(instr.lvalue.identifier);
            }
        }
    }
    let mut sites = Vec::new();
    for block in func.body.blocks.values() {
        for instr_id in &block.instructions {
            let instr = &func.instructions[instr_id.0 as usize];
            let InstructionValue::CallExpression { callee, args, .. } = &instr.value else {
                continue;
            };
            // The rewrite adds statements (and, for custom hooks, a variable)
            // around the read, which a value block cannot contain.
            if block.kind != react_compiler_hir::BlockKind::Block {
                continue;
            }
            let kind = match hook_kind(env, callee.identifier) {
                Some(HookKind::UseContext) if args.len() == 1 => SiteKind::Context,
                Some(HookKind::Custom) if load_globals.contains(&callee.identifier) => {
                    SiteKind::Hook
                }
                _ => continue,
            };
            if args
                .iter()
                .any(|arg| matches!(arg, PlaceOrSpread::Spread(_)))
            {
                continue;
            }
            sites.push(Site {
                kind,
                block: block.id,
                instruction: *instr_id,
                value: instr.lvalue.identifier,
                argument_count: args.len(),
            });
        }
    }
    sites
}

/// Where an identifier is used.
#[derive(Clone, Copy)]
enum UseSite {
    /// An instruction of the function (None) or of a nested function.
    Instruction(Option<FunctionId>, InstructionId),
    /// A terminal or phi.
    Other,
}

struct FunctionIndex {
    uses: FxHashMap<IdentifierId, Vec<UseSite>>,
    /// Instructions of the function (not nested functions) by lvalue.
    defs: FxHashMap<IdentifierId, (InstructionId, BlockId)>,
    params: FxHashSet<IdentifierId>,
    unconditional: FxHashSet<BlockId>,
}

impl FunctionIndex {
    fn build(func: &HirFunction, env: &Environment, unconditional: &FxHashSet<BlockId>) -> Self {
        let mut index = FunctionIndex {
            uses: FxHashMap::default(),
            defs: FxHashMap::default(),
            params: FxHashSet::default(),
            unconditional: unconditional.clone(),
        };
        for param in &func.params {
            match param {
                ParamPattern::Place(place) => {
                    index.params.insert(place.identifier);
                }
                ParamPattern::Spread(spread) => {
                    index.params.insert(spread.place.identifier);
                }
            }
        }
        for block in func.body.blocks.values() {
            for instr_id in &block.instructions {
                let instr = &func.instructions[instr_id.0 as usize];
                index
                    .defs
                    .insert(instr.lvalue.identifier, (*instr_id, block.id));
                for place in visitors::each_instruction_lvalue_ids(instr) {
                    index.defs.entry(place).or_insert((*instr_id, block.id));
                }
            }
        }
        index.collect_uses(func, None, env);
        index
    }

    fn collect_uses(&mut self, func: &HirFunction, owner: Option<FunctionId>, env: &Environment) {
        for block in func.body.blocks.values() {
            for phi in &block.phis {
                for operand in phi.operands.values() {
                    self.uses
                        .entry(operand.identifier)
                        .or_default()
                        .push(UseSite::Other);
                }
            }
            for instr_id in &block.instructions {
                let instr = &func.instructions[instr_id.0 as usize];
                match &instr.value {
                    // A nested function's context lists captured values that
                    // its body may not read; the reads are in its body.
                    InstructionValue::FunctionExpression { lowered_func, .. }
                    | InstructionValue::ObjectMethod { lowered_func, .. } => {
                        let nested = &env.functions[lowered_func.func.0 as usize];
                        self.collect_uses(nested, Some(lowered_func.func), env);
                    }
                    value => {
                        for place in visitors::each_instruction_value_operand(value, env) {
                            self.uses
                                .entry(place.identifier)
                                .or_default()
                                .push(UseSite::Instruction(owner, *instr_id));
                        }
                    }
                }
            }
            for place in visitors::each_terminal_operand(&block.terminal) {
                self.uses
                    .entry(place.identifier)
                    .or_default()
                    .push(UseSite::Other);
            }
        }
    }
}

/// A value that can be computed right before the context read.
#[derive(Clone, Debug, PartialEq)]
enum Expr {
    /// An identifier whose value is available at the read.
    Available(IdentifierId),
    Property(Box<Expr>, PropertyLiteral),
    /// A constant, which has the same value wherever it is evaluated.
    Primitive(PrimitiveValue),
}

#[derive(Clone, Debug, PartialEq)]
enum Key {
    Static(PropertyLiteral),
    Dynamic(Expr),
}

#[derive(Clone, Debug, PartialEq)]
enum Entry {
    Read(Vec<Key>),
    Equals(Expr, Vec<Key>),
}

fn instruction<'a>(
    func: &'a HirFunction,
    env: &'a Environment,
    owner: Option<FunctionId>,
    id: InstructionId,
) -> &'a Instruction {
    match owner {
        None => &func.instructions[id.0 as usize],
        Some(f) => &env.functions[f.0 as usize].instructions[id.0 as usize],
    }
}

/// The value of `id` as an expression available right before the site, if
/// there is one.
fn available(
    func: &HirFunction,
    index: &FunctionIndex,
    site: &Site,
    owner: Option<FunctionId>,
    id: IdentifierId,
    depth: usize,
) -> Option<Expr> {
    if depth > 8 {
        return None;
    }
    if index.params.contains(&id) {
        return Some(Expr::Available(id));
    }
    // Only values of the function itself: a nested function's values exist
    // when it runs.
    if owner.is_some() {
        return None;
    }
    let &(def, block) = index.defs.get(&id)?;
    let site_order = func.instructions[site.instruction.0 as usize].id;
    let instr = &func.instructions[def.0 as usize];
    if let InstructionValue::Primitive { value, .. } = &instr.value {
        return Some(Expr::Primitive(value.clone()));
    }
    if instr.id < site_order && index.unconditional.contains(&block) {
        return Some(Expr::Available(id));
    }
    // Property reads of values that are available and frozen (parameters and
    // values destructured from them) can be evaluated again before the site.
    match &instr.value {
        InstructionValue::PropertyLoad {
            object, property, ..
        } => {
            let object = available(func, index, site, owner, object.identifier, depth + 1)?;
            if !is_frozen_root(func, index, &object) {
                return None;
            }
            Some(Expr::Property(Box::new(object), property.clone()))
        }
        InstructionValue::LoadLocal { place, .. } => {
            available(func, index, site, owner, place.identifier, depth + 1)
        }
        _ => None,
    }
}

/// Whether the root of an expression is a parameter or a value read from one
/// by destructuring or property loads before the site (props are frozen).
fn is_frozen_root(func: &HirFunction, index: &FunctionIndex, expr: &Expr) -> bool {
    let mut id = match expr {
        Expr::Available(id) => *id,
        Expr::Property(object, _) => return is_frozen_root(func, index, object),
        Expr::Primitive(_) => return false,
    };
    for _ in 0..16 {
        if index.params.contains(&id) {
            return true;
        }
        let Some(&(def, _)) = index.defs.get(&id) else {
            return false;
        };
        id = match &func.instructions[def.0 as usize].value {
            InstructionValue::LoadLocal { place, .. } => place.identifier,
            InstructionValue::PropertyLoad { object, .. } => object.identifier,
            InstructionValue::Destructure { value, .. } => value.identifier,
            InstructionValue::StoreLocal { value, lvalue, .. }
                if lvalue.kind != InstructionKind::Reassign =>
            {
                value.identifier
            }
            _ => return false,
        };
    }
    false
}

/// The entries selecting everything the function reads from the site's value,
/// or None if the value is used as a whole.
fn analyze(
    func: &HirFunction,
    env: &Environment,
    index: &FunctionIndex,
    site: &Site,
) -> Option<Vec<Entry>> {
    // Identifiers holding a value at a path of the site's value.
    let mut paths: FxHashMap<IdentifierId, Vec<Key>> = FxHashMap::default();
    let mut worklist: Vec<IdentifierId> = vec![site.value];
    paths.insert(site.value, Vec::new());
    let mut entries: Vec<Entry> = Vec::new();

    let add_alias = |paths: &mut FxHashMap<IdentifierId, Vec<Key>>,
                     worklist: &mut Vec<IdentifierId>,
                     id: IdentifierId,
                     path: Vec<Key>|
     -> bool {
        match paths.get(&id) {
            Some(existing) => *existing == path,
            None => {
                paths.insert(id, path);
                worklist.push(id);
                true
            }
        }
    };

    while let Some(id) = worklist.pop() {
        let path = paths[&id].clone();
        let uses = index.uses.get(&id).cloned().unwrap_or_default();
        for use_site in uses {
            let UseSite::Instruction(owner, instr_id) = use_site else {
                if path.is_empty() {
                    return None;
                }
                entries.push(Entry::Read(path.clone()));
                continue;
            };
            let instr = instruction(func, env, owner, instr_id);
            let lvalue = instr.lvalue.identifier;
            let whole = match &instr.value {
                InstructionValue::LoadLocal { place, .. } if place.identifier == id => {
                    !add_alias(&mut paths, &mut worklist, lvalue, path.clone())
                }
                InstructionValue::TypeCastExpression { value, .. } if value.identifier == id => {
                    !add_alias(&mut paths, &mut worklist, lvalue, path.clone())
                }
                InstructionValue::StoreLocal {
                    lvalue: target,
                    value,
                    ..
                } if value.identifier == id && target.kind != InstructionKind::Reassign => {
                    !add_alias(
                        &mut paths,
                        &mut worklist,
                        target.place.identifier,
                        path.clone(),
                    )
                }
                InstructionValue::PropertyLoad {
                    object, property, ..
                } if object.identifier == id => {
                    let mut child = path.clone();
                    child.push(Key::Static(property.clone()));
                    !add_alias(&mut paths, &mut worklist, lvalue, child)
                }
                InstructionValue::ComputedLoad {
                    object, property, ..
                } if object.identifier == id && property.identifier != id => {
                    match available(func, index, site, owner, property.identifier, 0) {
                        Some(key) => {
                            let mut child = path.clone();
                            child.push(Key::Dynamic(key));
                            !add_alias(&mut paths, &mut worklist, lvalue, child)
                        }
                        None => true,
                    }
                }
                InstructionValue::Destructure {
                    lvalue: target,
                    value,
                    ..
                } if value.identifier == id && target.kind != InstructionKind::Reassign => {
                    match &target.pattern {
                        Pattern::Object(pattern) => {
                            let mut whole = false;
                            for property in &pattern.properties {
                                match property {
                                    ObjectPropertyOrSpread::Property(property)
                                        if property.property_type
                                            == ObjectPropertyType::Property =>
                                    {
                                        let key = match &property.key {
                                            ObjectPropertyKey::String { name }
                                            | ObjectPropertyKey::Identifier { name } => Some(
                                                Key::Static(PropertyLiteral::String(name.clone())),
                                            ),
                                            ObjectPropertyKey::Number { name } => {
                                                Some(Key::Static(PropertyLiteral::Number(*name)))
                                            }
                                            ObjectPropertyKey::Computed { name } => available(
                                                func,
                                                index,
                                                site,
                                                owner,
                                                name.identifier,
                                                0,
                                            )
                                            .map(Key::Dynamic),
                                        };
                                        match key {
                                            Some(key) => {
                                                let mut child = path.clone();
                                                child.push(key);
                                                if !add_alias(
                                                    &mut paths,
                                                    &mut worklist,
                                                    property.place.identifier,
                                                    child,
                                                ) {
                                                    whole = true;
                                                }
                                            }
                                            None => whole = true,
                                        }
                                    }
                                    _ => whole = true,
                                }
                            }
                            whole
                        }
                        Pattern::Array(_) => true,
                    }
                }
                InstructionValue::BinaryExpression {
                    operator: BinaryOperator::StrictEqual | BinaryOperator::StrictNotEqual,
                    left,
                    right,
                    ..
                } if (left.identifier == id) != (right.identifier == id) => {
                    let other = if left.identifier == id { right } else { left };
                    match available(func, index, site, owner, other.identifier, 0) {
                        Some(operand) => {
                            entries.push(Entry::Equals(operand, path.clone()));
                            false
                        }
                        None => true,
                    }
                }
                _ => true,
            };
            if whole {
                if path.is_empty() {
                    return None;
                }
                entries.push(Entry::Read(path.clone()));
            }
        }
    }
    // An operand that is itself a value of the context (compared with another
    // value of it) changes with the context: select both values instead.
    let mut result: Vec<Entry> = Vec::new();
    for entry in entries {
        let entry = match entry {
            Entry::Equals(Expr::Available(operand), path) if paths.contains_key(&operand) => {
                let operand_path = paths[&operand].clone();
                if operand_path.is_empty() {
                    return None;
                }
                if !result.contains(&Entry::Read(operand_path.clone())) {
                    result.push(Entry::Read(operand_path));
                }
                Entry::Read(path)
            }
            entry => entry,
        };
        let depends_on_context = |key: &Key| match key {
            Key::Dynamic(expr) => expr_depends_on(expr, &paths),
            Key::Static(_) => false,
        };
        let keys_depend = match &entry {
            Entry::Read(keys) | Entry::Equals(_, keys) => keys.iter().any(depends_on_context),
        };
        let operand_depends =
            matches!(&entry, Entry::Equals(operand, _) if expr_depends_on(operand, &paths));
        if keys_depend || operand_depends {
            return None;
        }
        if !result.contains(&entry) {
            result.push(entry);
        }
    }
    // A value at a path is determined by the value at a shorter path (context
    // values are not mutated), so entries under a selected path are implied.
    let reads: Vec<Vec<Key>> = result
        .iter()
        .filter_map(|entry| match entry {
            Entry::Read(keys) => Some(keys.clone()),
            Entry::Equals(..) => None,
        })
        .collect();
    result.retain(|entry| match entry {
        Entry::Read(keys) => !reads
            .iter()
            .any(|read| read.len() < keys.len() && keys.starts_with(read)),
        Entry::Equals(_, keys) => !reads
            .iter()
            .any(|read| read.len() <= keys.len() && keys.starts_with(read)),
    });
    Some(result)
}

/// The top-level keys of the store state that the selector passed as the first
/// argument of a custom hook call reads (see "Selector reads" above), or None
/// if the argument is not an inline function or reads its first parameter in
/// another way (passes it on, returns it, reads a computed key, captures it in
/// a nested function...).
fn selector_reads(
    func: &HirFunction,
    env: &Environment,
    index: &FunctionIndex,
    site: &Site,
) -> Option<Vec<PropertyLiteral>> {
    let InstructionValue::CallExpression { args, .. } =
        &func.instructions[site.instruction.0 as usize].value
    else {
        return None;
    };
    let Some(PlaceOrSpread::Place(argument)) = args.first() else {
        return None;
    };
    let selector = selector_function(func, index, argument.identifier, 0)?;
    let selector_func = &env.functions[selector.0 as usize];
    if selector_func.is_async || selector_func.generator {
        return None;
    }
    let state = match selector_func.params.first() {
        // A selector without parameters reads no key.
        None => return Some(Vec::new()),
        Some(ParamPattern::Place(place)) => place.identifier,
        Some(ParamPattern::Spread(_)) => return None,
    };
    let mut keys: Vec<PropertyLiteral> = Vec::new();
    let mut add_key = |key: PropertyLiteral| {
        if !keys.contains(&key) {
            keys.push(key);
        }
    };
    // The state and the locals holding it.
    let mut aliases: FxHashSet<IdentifierId> = FxHashSet::default();
    aliases.insert(state);
    let mut worklist = vec![state];
    while let Some(id) = worklist.pop() {
        let uses = index.uses.get(&id).map(Vec::as_slice).unwrap_or_default();
        for use_site in uses {
            let UseSite::Instruction(Some(owner), instr_id) = *use_site else {
                return None;
            };
            if owner != selector {
                return None;
            }
            let instr = &selector_func.instructions[instr_id.0 as usize];
            let alias = match &instr.value {
                InstructionValue::LoadLocal { place, .. } if place.identifier == id => {
                    instr.lvalue.identifier
                }
                InstructionValue::TypeCastExpression { value, .. } if value.identifier == id => {
                    instr.lvalue.identifier
                }
                InstructionValue::StoreLocal { lvalue, value, .. }
                    if value.identifier == id && lvalue.kind != InstructionKind::Reassign =>
                {
                    lvalue.place.identifier
                }
                InstructionValue::PropertyLoad {
                    object, property, ..
                } if object.identifier == id => {
                    add_key(property.clone());
                    continue;
                }
                InstructionValue::Destructure { lvalue, value, .. }
                    if value.identifier == id && lvalue.kind != InstructionKind::Reassign =>
                {
                    let Pattern::Object(pattern) = &lvalue.pattern else {
                        return None;
                    };
                    for property in &pattern.properties {
                        let ObjectPropertyOrSpread::Property(property) = property else {
                            return None;
                        };
                        if property.property_type != ObjectPropertyType::Property {
                            return None;
                        }
                        match &property.key {
                            ObjectPropertyKey::String { name }
                            | ObjectPropertyKey::Identifier { name } => {
                                add_key(PropertyLiteral::String(name.clone()))
                            }
                            ObjectPropertyKey::Number { name } => {
                                add_key(PropertyLiteral::Number(*name))
                            }
                            ObjectPropertyKey::Computed { .. } => return None,
                        }
                    }
                    continue;
                }
                _ => return None,
            };
            if aliases.insert(alias) {
                worklist.push(alias);
            }
        }
    }
    Some(keys)
}

/// The function expression of the component that `id` holds, followed through
/// loads and `const` declarations.
fn selector_function(
    func: &HirFunction,
    index: &FunctionIndex,
    id: IdentifierId,
    depth: usize,
) -> Option<FunctionId> {
    if depth > 8 {
        return None;
    }
    let &(def, _) = index.defs.get(&id)?;
    match &func.instructions[def.0 as usize].value {
        InstructionValue::FunctionExpression { lowered_func, .. } => Some(lowered_func.func),
        InstructionValue::LoadLocal { place, .. } => {
            selector_function(func, index, place.identifier, depth + 1)
        }
        InstructionValue::StoreLocal { lvalue, value, .. }
            if lvalue.place.identifier == id && lvalue.kind == InstructionKind::Const =>
        {
            selector_function(func, index, value.identifier, depth + 1)
        }
        _ => None,
    }
}

fn expr_depends_on(expr: &Expr, paths: &FxHashMap<IdentifierId, Vec<Key>>) -> bool {
    match expr {
        Expr::Available(id) => paths.contains_key(id),
        Expr::Property(object, _) => expr_depends_on(object, paths),
        Expr::Primitive(_) => false,
    }
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

fn temporary(env: &mut Environment, ty: Type) -> Place {
    let place = create_temporary_place(env, None);
    let type_id = env.identifiers[place.identifier.0 as usize].type_;
    env.types[type_id.0 as usize] = ty;
    place
}

fn materialize(
    func: &mut HirFunction,
    env: &mut Environment,
    instructions: &mut Vec<InstructionId>,
    expr: &Expr,
) -> Place {
    match expr {
        Expr::Available(id) => Place {
            identifier: *id,
            effect: react_compiler_hir::Effect::Unknown,
            reactive: false,
            loc: None,
        },
        Expr::Primitive(value) => primitive(func, env, instructions, value.clone()),
        Expr::Property(object, property) => {
            let object = materialize(func, env, instructions, object);
            let place = temporary(env, Type::Poly);
            push_instruction(
                func,
                instructions,
                place.clone(),
                InstructionValue::PropertyLoad {
                    object,
                    property: property.clone(),
                    loc: None,
                },
            );
            place
        }
    }
}

fn primitive(
    func: &mut HirFunction,
    env: &mut Environment,
    instructions: &mut Vec<InstructionId>,
    value: PrimitiveValue,
) -> Place {
    let place = temporary(env, Type::Primitive);
    push_instruction(
        func,
        instructions,
        place.clone(),
        InstructionValue::Primitive { value, loc: None },
    );
    place
}

fn array(
    func: &mut HirFunction,
    env: &mut Environment,
    instructions: &mut Vec<InstructionId>,
    elements: Vec<Place>,
) -> Place {
    let place = temporary(
        env,
        Type::Object {
            shape_id: Some(react_compiler_hir::object_shape::BUILT_IN_ARRAY_ID.to_string()),
        },
    );
    push_instruction(
        func,
        instructions,
        place.clone(),
        InstructionValue::ArrayExpression {
            elements: elements.into_iter().map(ArrayElement::Place).collect(),
            loc: None,
        },
    );
    place
}

fn load_global(
    func: &mut HirFunction,
    env: &mut Environment,
    instructions: &mut Vec<InstructionId>,
    binding: NonLocalBinding,
    ty: Type,
) -> Place {
    let place = temporary(env, ty);
    push_instruction(
        func,
        instructions,
        place.clone(),
        InstructionValue::LoadGlobal { binding, loc: None },
    );
    place
}

fn rewrite(
    func: &mut HirFunction,
    env: &mut Environment,
    imports: &mut dyn ContextSelectorImports,
    site: &Site,
    entries: Option<&[Entry]>,
    sliced: bool,
    reads: Option<&[PropertyLiteral]>,
) {
    let mut before: Vec<InstructionId> = Vec::new();
    // The existing analysis proves that the entire dependency is one key.
    // Keep the generic descriptor for nested paths, comparisons, escapes and
    // custom hooks. The app and its component tree are not changed.
    let single_key =
        if env.config.enable_context_key_specialization && site.kind == SiteKind::Context {
            match entries {
                Some([Entry::Read(keys)]) if keys.len() == 1 => Some(keys[0].clone()),
                _ => None,
            }
        } else {
            None
        };
    let mut descriptor: Vec<Place> = Vec::new();
    for entry in if single_key.is_some() {
        &[]
    } else {
        entries.unwrap_or_default()
    } {
        let mut elements: Vec<Place> = Vec::new();
        let keys = match entry {
            Entry::Read(keys) => {
                elements.push(primitive(
                    func,
                    env,
                    &mut before,
                    PrimitiveValue::Number(FloatValue::new(0.0)),
                ));
                keys
            }
            Entry::Equals(operand, keys) => {
                elements.push(primitive(
                    func,
                    env,
                    &mut before,
                    PrimitiveValue::Number(FloatValue::new(1.0)),
                ));
                elements.push(materialize(func, env, &mut before, operand));
                keys
            }
        };
        for key in keys {
            let place = match key {
                Key::Static(PropertyLiteral::String(name)) => primitive(
                    func,
                    env,
                    &mut before,
                    PrimitiveValue::String(name.clone().into()),
                ),
                Key::Static(PropertyLiteral::Number(number)) => {
                    primitive(func, env, &mut before, PrimitiveValue::Number(*number))
                }
                Key::Dynamic(expr) => materialize(func, env, &mut before, expr),
            };
            elements.push(place);
        }
        descriptor.push(array(func, env, &mut before, elements));
    }
    // An unselected hook call (only made through the runtime for update
    // slicing) is described by `null`.
    let descriptor = if let Some(key) = &single_key {
        match key {
            Key::Static(PropertyLiteral::String(name)) => primitive(
                func,
                env,
                &mut before,
                PrimitiveValue::String(name.clone().into()),
            ),
            Key::Static(PropertyLiteral::Number(number)) => {
                primitive(func, env, &mut before, PrimitiveValue::Number(*number))
            }
            Key::Dynamic(expr) => materialize(func, env, &mut before, expr),
        }
    } else {
        match entries {
            Some(_) => array(func, env, &mut before, descriptor),
            None => primitive(func, env, &mut before, PrimitiveValue::Null),
        }
    };

    let mut after: Vec<InstructionId> = Vec::new();
    match site.kind {
        SiteKind::Context => {
            let callee_type = {
                let InstructionValue::CallExpression { callee, .. } =
                    &func.instructions[site.instruction.0 as usize].value
                else {
                    unreachable!("context sites are calls");
                };
                let type_id = env.identifiers[callee.identifier.0 as usize].type_;
                env.types[type_id.0 as usize].clone()
            };
            let binding = if single_key.is_some() {
                imports.use_context_key()
            } else {
                imports.use_context_paths()
            };
            let callee = load_global(func, env, &mut before, binding, callee_type);
            let InstructionValue::CallExpression {
                callee: site_callee,
                args,
                ..
            } = &mut func.instructions[site.instruction.0 as usize].value
            else {
                unreachable!("context sites are calls");
            };
            *site_callee = callee;
            args.push(PlaceOrSpread::Place(descriptor));
        }
        SiteKind::Hook => {
            let hook = {
                let InstructionValue::CallExpression { callee, .. } =
                    &func.instructions[site.instruction.0 as usize].value
                else {
                    unreachable!("hook sites are calls");
                };
                callee.clone()
            };
            // Both calls are typed as hooks: they must run in every render, at
            // their position (the snapshot is taken right before the hook
            // call), and are never memoized.
            let hook_type = env
                .get_custom_hook_type_opt()
                .expect("the custom hook type exists");
            let start = imports.start_selected_hook();
            let start_callee = load_global(func, env, &mut before, start, hook_type.clone());
            let snapshot = temporary(env, Type::Poly);
            let snapshot_name = env.generate_globally_unique_identifier_name(Some("selectedHook"));
            env.identifiers[snapshot.identifier.0 as usize].name =
                Some(react_compiler_hir::IdentifierName::Named(snapshot_name));
            push_instruction(
                func,
                &mut before,
                snapshot.clone(),
                InstructionValue::CallExpression {
                    callee: start_callee,
                    args: vec![PlaceOrSpread::Place(hook.clone())],
                    loc: None,
                },
            );
            if sliced {
                // `const value = useX(...args)` becomes
                // `const skipped = unstable_skipStoreHookN(started, useX, ...args);
                // const value = skipped !== useX ? skipped : useX(...args)`: the
                // runtime returns the hook itself unless React skipped the call.
                // The call keeps its callee (for validation and for the error of
                // calling a value that is not a function) and gets `skipped` as
                // an extra argument, which codegen turns into the conditional.
                let skip = imports.skip_store_hook(site.argument_count);
                let skip_callee = load_global(func, env, &mut before, skip, hook_type.clone());
                let skipped = temporary(env, Type::Poly);
                let skipped_name =
                    env.generate_globally_unique_identifier_name(Some("skippedHook"));
                env.identifiers[skipped.identifier.0 as usize].name =
                    Some(react_compiler_hir::IdentifierName::Named(skipped_name));
                let (hook_args, callee_id) = {
                    let InstructionValue::CallExpression { callee, args, .. } =
                        &func.instructions[site.instruction.0 as usize].value
                    else {
                        unreachable!("hook sites are calls");
                    };
                    (args.clone(), callee.identifier)
                };
                let mut skip_args = vec![
                    PlaceOrSpread::Place(snapshot.clone()),
                    PlaceOrSpread::Place(hook.clone()),
                ];
                skip_args.extend(hook_args);
                push_instruction(
                    func,
                    &mut before,
                    skipped.clone(),
                    InstructionValue::CallExpression {
                        callee: skip_callee,
                        args: skip_args,
                        loc: None,
                    },
                );
                let InstructionValue::CallExpression { args, .. } =
                    &mut func.instructions[site.instruction.0 as usize].value
                else {
                    unreachable!("hook sites are calls");
                };
                args.push(PlaceOrSpread::Place(skipped));
                env.add_sliced_hook_callee(callee_id);
            }
            let mut select_args = vec![
                PlaceOrSpread::Place(snapshot),
                PlaceOrSpread::Place(Place {
                    identifier: site.value,
                    effect: react_compiler_hir::Effect::Unknown,
                    reactive: false,
                    loc: None,
                }),
                PlaceOrSpread::Place(hook),
                PlaceOrSpread::Place(descriptor),
            ];
            if let Some(reads) = reads {
                let keys = reads
                    .iter()
                    .map(|key| {
                        let value = match key {
                            PropertyLiteral::String(name) => {
                                PrimitiveValue::String(name.clone().into())
                            }
                            PropertyLiteral::Number(number) => PrimitiveValue::Number(*number),
                        };
                        primitive(func, env, &mut before, value)
                    })
                    .collect();
                select_args.push(PlaceOrSpread::Place(array(func, env, &mut before, keys)));
            }
            let select = imports.select_hook_paths();
            let select_callee = load_global(func, env, &mut after, select, hook_type);
            let result = temporary(env, Type::Poly);
            push_instruction(
                func,
                &mut after,
                result,
                InstructionValue::CallExpression {
                    callee: select_callee,
                    args: select_args,
                    loc: None,
                },
            );
        }
    }

    let block = func.body.blocks.get_mut(&site.block).expect("site block");
    let position = block
        .instructions
        .iter()
        .position(|id| *id == site.instruction)
        .expect("the site is in its block");
    let mut instructions =
        Vec::with_capacity(block.instructions.len() + before.len() + after.len());
    instructions.extend_from_slice(&block.instructions[..position]);
    instructions.extend(before);
    instructions.push(site.instruction);
    instructions.extend(after);
    instructions.extend_from_slice(&block.instructions[position + 1..]);
    block.instructions = instructions;
}
