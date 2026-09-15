// Copyright (c) Meta Platforms, Inc. and affiliates.
//
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.

//! Inlines same-module, hook-free function components into the JSX sites that
//! render them.
//!
//! ```text
//! function Label({text}) { return <span>{text}</span>; }
//! function Row(props) { return <li><Label text={props.name} /></li>; }
//!
//! =>
//!
//! function Row(props) {
//!   const text = props.name;
//!   return <li><span>{text}</span></li>;
//! }
//! ```
//!
//! A site is inlined only when the transform is unobservable to application
//! code. The rules, and the observable difference each one rules out, are
//! documented in `compiler/docs/experiments/0001-component-inlining.md`.
//! Module-level rules (C1, C2, C4, C5) are enforced by the entrypoint before a
//! component is offered as a candidate; this pass enforces the rules that need
//! HIR (C3, C6, C7 via [`summarize_callee`], S1-S5 at each site).
//!
//! The pass runs before SSA. The callee is lowered into the caller's
//! `Environment` (fresh identifiers, blocks and instructions, no captured
//! context), its parameters are bound to the site's attributes, and its CFG
//! is spliced in place of the JSX instruction using the same shapes as
//! `InlineImmediatelyInvokedFunctionExpressions`.

use std::rc::Rc;

use indexmap::IndexSet;
use rustc_hash::{FxHashMap, FxHashSet};

use react_compiler_ast::scope::ScopeInfo;
use react_compiler_diagnostics::{CompilerError, CompilerErrorDetail, ErrorCategory};
use react_compiler_hir::block_template::ReturnsBlock;
use react_compiler_hir::environment::{Environment, is_hook_name};
use react_compiler_hir::visitors;
use react_compiler_hir::{
    BasicBlock, BlockId, BlockKind, EvaluationOrder, GENERATED_SOURCE, GotoVariant,
    HirFunction, IdentifierId, IdentifierName, Instruction, InstructionId, InstructionKind,
    InstructionValue, JsxAttribute, JsxTag, LValue, NonLocalBinding, ObjectProperty,
    ObjectPropertyKey, ObjectPropertyOrSpread, ObjectPropertyType, ParamPattern, Pattern, Place,
    PrimitiveValue, PropertyLiteral, ReactFunctionType, Terminal,
};
use react_compiler_lowering::{
    FunctionNode, create_temporary_place, get_reverse_postordered_blocks, mark_instruction_ids,
    mark_predecessors,
};

use crate::merge_consecutive_blocks::merge_consecutive_blocks;

/// Upper bound on nested inlining depth. Recursion is already excluded by
/// rule C7; this bounds output growth for deep chains of small components.
const MAX_INLINE_DEPTH: usize = 16;

/// Upper bound on the number of sites inlined into a single function.
const MAX_INLINED_SITES_PER_FUNCTION: usize = 512;

/// Host elements whose children React does not render as child elements
/// (they are stringified, treated as a default value, or consumed by a macro
/// transform), so they are never fixed rendered positions.
const NON_RENDERING_HOST_TAGS: &[&str] = &[
    "textarea", "option", "title", "script", "style", "noscript", "fbt", "fbs",
];

/// A component that passed the module-level rules and [`summarize_callee`].
pub struct InlineCandidate<'a> {
    pub node: FunctionNode<'a>,
    pub summary: CalleeSummary,
    /// Compiled on its own, with the other candidates inlined into it, the
    /// component returns blocks (see `ReturnsBlock`).
    /// Only such components are inlined into list callbacks.
    pub returns_block: ReturnsBlock,
}

/// The set of components that may be inlined into functions of this module,
/// keyed by their module-scope binding name.
#[derive(Default)]
pub struct InlineComponentCandidates<'a> {
    components: FxHashMap<String, InlineCandidate<'a>>,
}

impl<'a> InlineComponentCandidates<'a> {
    pub fn new() -> Self {
        Self {
            components: FxHashMap::default(),
        }
    }

    pub fn insert(&mut self, name: String, candidate: InlineCandidate<'a>) {
        self.components.insert(name, candidate);
    }

    pub fn get(&self, name: &str) -> Option<&InlineCandidate<'a>> {
        self.components.get(name)
    }

    pub fn set_returns_block(&mut self, name: &str, returns_block: ReturnsBlock) {
        if let Some(candidate) = self.components.get_mut(name) {
            candidate.returns_block = returns_block;
        }
    }

    pub fn is_empty(&self) -> bool {
        self.components.is_empty()
    }

    pub fn len(&self) -> usize {
        self.components.len()
    }
}

/// Shape facts about a callee's HIR that decide where it may be inlined.
#[derive(Debug, Clone)]
pub struct CalleeSummary {
    /// The function has exactly one exit terminal and it is a `return`.
    pub single_return: bool,
    /// The function contains terminals that can only appear at statement
    /// level (if/switch/loops/try/label/throw).
    pub has_statement_terminals: bool,
    /// The site's `key` can be moved onto every returned element: none of the
    /// returned elements has its own `key`, and each is only used by a return.
    pub can_transfer_key: bool,
    /// The callee destructures `children` from its props and only places it
    /// into rendered positions. Multiple JSX children can then be bound as a
    /// fragment, which React reconciles exactly like the children array but
    /// which, unlike a runtime-created array, is not subject to key warnings.
    pub children_only_rendered: bool,
    /// The callee's parameter can be bound without declaring variables, as
    /// required inside value blocks: it is destructured (or absent), each
    /// destructured binding is assigned once and loaded at most once, and the
    /// callee declares no other named variables.
    pub value_site_bindable: bool,
}

/// Why a callee cannot be inlined. Used for debug logging by the entrypoint.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NotInlinableReason {
    TooManyParams,
    SpreadParam,
    AsyncOrGenerator,
    CallsHook,
    ReturnsNonElement,
}

/// Checks rules C3 (no hooks), C4 (parameters, async, generator) and C6 (every
/// returned value is a non-Fragment element or a primitive) on the lowered HIR
/// of a callee, and computes the shape facts needed at each site.
pub fn summarize_callee(
    func: &HirFunction,
    env: &Environment,
) -> Result<CalleeSummary, NotInlinableReason> {
    if func.params.len() > 1 {
        return Err(NotInlinableReason::TooManyParams);
    }
    if matches!(func.params.first(), Some(ParamPattern::Spread(_))) {
        return Err(NotInlinableReason::SpreadParam);
    }
    if func.is_async || func.generator {
        return Err(NotInlinableReason::AsyncOrGenerator);
    }
    if function_calls_hook(func, env) {
        return Err(NotInlinableReason::CallsHook);
    }

    let flow = FlowIndex::build(func, env);
    let mut returned_jsx: Vec<InstructionId> = Vec::new();
    let mut exit_count = 0;
    let mut return_count = 0;
    let mut has_statement_terminals = false;
    for block in func.body.blocks.values() {
        match &block.terminal {
            Terminal::Return { value, .. } => {
                exit_count += 1;
                return_count += 1;
                let mut visiting = FxHashSet::default();
                if !flow.collect_returned_elements(
                    func,
                    value.identifier,
                    &mut returned_jsx,
                    &mut visiting,
                ) {
                    return Err(NotInlinableReason::ReturnsNonElement);
                }
            }
            Terminal::Throw { .. } => {
                exit_count += 1;
                has_statement_terminals = true;
            }
            Terminal::If { .. }
            | Terminal::Switch { .. }
            | Terminal::DoWhile { .. }
            | Terminal::While { .. }
            | Terminal::For { .. }
            | Terminal::ForOf { .. }
            | Terminal::ForIn { .. }
            | Terminal::Label { .. }
            | Terminal::Try { .. }
            | Terminal::MaybeThrow { .. }
            | Terminal::Scope { .. }
            | Terminal::PrunedScope { .. }
            | Terminal::Unsupported { .. } => {
                has_statement_terminals = true;
            }
            Terminal::Unreachable { .. }
            | Terminal::Goto { .. }
            | Terminal::Branch { .. }
            | Terminal::Logical { .. }
            | Terminal::Ternary { .. }
            | Terminal::Optional { .. }
            | Terminal::Sequence { .. } => {}
        }
    }

    let can_transfer_key = returned_jsx.iter().all(|instr_id| {
        let instr = &func.instructions[instr_id.0 as usize];
        let has_key = match &instr.value {
            InstructionValue::JsxExpression { props, .. } => props.iter().any(
                |attr| matches!(attr, JsxAttribute::Attribute { name, .. } if name == "key"),
            ),
            _ => true,
        };
        !has_key && flow.flows_only_to_return(func, instr.lvalue.identifier)
    });

    let children_only_rendered = match func.params.as_slice() {
        [ParamPattern::Place(param)] => find_param_destructure(func, env, param.identifier)
            .and_then(|(_, _, properties)| {
                properties.into_iter().find_map(|property| match property {
                    DestructuredProperty::Named { name, place } if name == "children" => {
                        Some(place)
                    }
                    _ => None,
                })
            })
            .is_some_and(|children| {
                flow.is_rendered(
                    func,
                    children.identifier,
                    &mut FxHashSet::default(),
                )
            }),
        _ => false,
    };

    let value_site_bindable = is_value_site_bindable(func, env, &flow);

    Ok(CalleeSummary {
        single_return: exit_count == 1 && return_count == 1,
        has_statement_terminals,
        can_transfer_key,
        children_only_rendered,
        value_site_bindable,
    })
}

/// Inline candidate components into the body of the component `func`.
/// Returns the number of inlined sites.
///
/// With compiled blocks enabled, sites in `.map` callbacks whose result is
/// rendered are also inlined, but only for components that compile to a leaf
/// block. The compiler does not memoize values inside callbacks, so a
/// component rendered from a callback is otherwise the per-item memoization
/// boundary. A leaf block needs no memoization boundary: React DOM renders the
/// list of such blocks without fibers and compares each item's hole values.
pub fn inline_components(
    func: &mut HirFunction,
    env: &mut Environment,
    candidates: &InlineComponentCandidates<'_>,
    scope_info: &ScopeInfo,
) -> Result<usize, CompilerError> {
    if candidates.is_empty() || func.fn_type != ReactFunctionType::Component {
        return Ok(0);
    }
    let mut cx = InlineContext {
        candidates,
        scope_info,
        inlined_sites: 0,
        list_item_memoization: env.config.enable_jsx_blocks
            && env.config.enable_list_item_memoization,
    };
    inline_in_function(func, env, &mut cx, ReturnFlow::Rendered, Rc::new(Vec::new()))?;
    Ok(cx.inlined_sites)
}

struct InlineContext<'c, 'a> {
    candidates: &'c InlineComponentCandidates<'a>,
    scope_info: &'c ScopeInfo,
    inlined_sites: usize,
    /// List item memoization is enabled (see the performance rule in
    /// `find_site`).
    list_item_memoization: bool,
}

/// Where the value returned by the function being processed goes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ReturnFlow {
    /// The component's return value: a fixed rendered position.
    Rendered,
    /// A `.map` callback whose result is rendered: each returned value is an
    /// item of a rendered list.
    RenderedListItem,
}

/// The chain of component names whose bodies produced an instruction.
type Origin = Rc<Vec<String>>;

fn inline_in_function(
    func: &mut HirFunction,
    env: &mut Environment,
    cx: &mut InlineContext<'_, '_>,
    return_flow: ReturnFlow,
    base_origin: Origin,
) -> Result<(), CompilerError> {
    let mut origins: FxHashMap<InstructionId, Origin> = FxHashMap::default();
    let mut inlined_here = 0;

    while inlined_here < MAX_INLINED_SITES_PER_FUNCTION {
        let flow = FlowIndex::build(func, env);
        let Some(site) = find_site(func, cx, &flow, return_flow, &origins, &base_origin) else {
            break;
        };
        splice_site(func, env, cx, site, &mut origins)?;
        inlined_here += 1;
        cx.inlined_sites += 1;
    }

    if !env.config.enable_jsx_blocks {
        return Ok(());
    }
    // Rendered list callbacks. This happens after the function's own sites are
    // inlined so that callbacks introduced by inlined bodies are included.
    let flow = FlowIndex::build(func, env);
    let mut callbacks: Vec<(react_compiler_hir::FunctionId, Origin)> = Vec::new();
    for block in func.body.blocks.values() {
        for instr_id in &block.instructions {
            let instr = &func.instructions[instr_id.0 as usize];
            if let InstructionValue::FunctionExpression { lowered_func, .. } = &instr.value {
                if flow.is_rendered_map_callback(func, instr.lvalue.identifier) {
                    let origin = origins
                        .get(instr_id)
                        .cloned()
                        .unwrap_or_else(|| base_origin.clone());
                    callbacks.push((lowered_func.func, origin));
                }
            }
        }
    }
    for (func_id, origin) in callbacks {
        let mut inner = std::mem::replace(
            &mut env.functions[func_id.0 as usize],
            react_compiler_ssa::enter_ssa::placeholder_function(),
        );
        let result = inline_in_function(
            &mut inner,
            env,
            cx,
            ReturnFlow::RenderedListItem,
            origin,
        );
        env.functions[func_id.0 as usize] = inner;
        result?;
    }
    Ok(())
}

// =============================================================================
// Flow analysis (pre-SSA)
// =============================================================================

#[derive(Debug, Clone, Copy)]
enum Use {
    Instruction(InstructionId),
    Terminal(BlockId),
}

/// Def/use index for one function in pre-SSA HIR. Temporaries have a single
/// definition; named locals may be stored many times and are tracked through
/// their `StoreLocal`/`DeclareLocal` instructions.
struct FlowIndex {
    uses: FxHashMap<IdentifierId, Vec<Use>>,
    /// Instructions whose lvalue is the identifier.
    value_defs: FxHashMap<IdentifierId, Vec<InstructionId>>,
    /// `StoreLocal`/`DeclareLocal` instructions that assign the identifier.
    store_defs: FxHashMap<IdentifierId, Vec<InstructionId>>,
    /// Identifiers assigned by anything other than an instruction lvalue,
    /// `StoreLocal` or `DeclareLocal` (params, destructuring, updates, ...).
    other_defs: FxHashSet<IdentifierId>,
}

impl FlowIndex {
    fn build(func: &HirFunction, env: &Environment) -> Self {
        let mut index = FlowIndex {
            uses: FxHashMap::default(),
            value_defs: FxHashMap::default(),
            store_defs: FxHashMap::default(),
            other_defs: FxHashSet::default(),
        };
        for param in &func.params {
            match param {
                ParamPattern::Place(place) => {
                    index.other_defs.insert(place.identifier);
                }
                ParamPattern::Spread(spread) => {
                    index.other_defs.insert(spread.place.identifier);
                }
            }
        }
        for place in &func.context {
            index.other_defs.insert(place.identifier);
        }
        for block in func.body.blocks.values() {
            for instr_id in &block.instructions {
                let instr = &func.instructions[instr_id.0 as usize];
                index
                    .value_defs
                    .entry(instr.lvalue.identifier)
                    .or_default()
                    .push(*instr_id);
                match &instr.value {
                    InstructionValue::StoreLocal { lvalue, .. }
                    | InstructionValue::DeclareLocal { lvalue, .. } => {
                        index
                            .store_defs
                            .entry(lvalue.place.identifier)
                            .or_default()
                            .push(*instr_id);
                    }
                    other => {
                        for place in visitors::each_instruction_value_lvalue(other) {
                            index.other_defs.insert(place.identifier);
                        }
                    }
                }
                for place in visitors::each_instruction_value_operand(&instr.value, env) {
                    index
                        .uses
                        .entry(place.identifier)
                        .or_default()
                        .push(Use::Instruction(*instr_id));
                }
            }
            for place in visitors::each_terminal_operand(&block.terminal) {
                index
                    .uses
                    .entry(place.identifier)
                    .or_default()
                    .push(Use::Terminal(block.id));
            }
        }
        index
    }

    fn uses_of(&self, id: IdentifierId) -> &[Use] {
        self.uses.get(&id).map(|v| v.as_slice()).unwrap_or(&[])
    }

    /// Rule S4: `id` only flows into fixed rendered positions.
    fn is_rendered(
        &self,
        func: &HirFunction,
        id: IdentifierId,
            visiting: &mut FxHashSet<IdentifierId>,
    ) -> bool {
        if !visiting.insert(id) {
            return false;
        }
        let uses = self.uses_of(id);
        let result = !uses.is_empty()
            && uses
                .iter()
                .all(|use_| self.is_rendered_use(func, id, *use_, visiting));
        visiting.remove(&id);
        result
    }

    fn is_rendered_use(
        &self,
        func: &HirFunction,
        id: IdentifierId,
        use_: Use,
            visiting: &mut FxHashSet<IdentifierId>,
    ) -> bool {
        match use_ {
            Use::Terminal(block_id) => match &func.body.blocks[&block_id].terminal {
                Terminal::Return { value, .. } => {
                    value.identifier == id
                }
                _ => false,
            },
            Use::Instruction(instr_id) => {
                let instr = &func.instructions[instr_id.0 as usize];
                match &instr.value {
                    InstructionValue::JsxExpression {
                        tag: JsxTag::Builtin(tag),
                        props,
                        children,
                        ..
                    } if !NON_RENDERING_HOST_TAGS.contains(&tag.name.as_str()) => {
                        let in_props = props.iter().any(|attr| match attr {
                            JsxAttribute::Attribute { place, .. } => place.identifier == id,
                            JsxAttribute::SpreadAttribute { argument } => {
                                argument.identifier == id
                            }
                        });
                        let in_children = children
                            .as_ref()
                            .is_some_and(|c| c.iter().any(|p| p.identifier == id));
                        !in_props
                            && in_children
                            && self.is_rendered(
                                func,
                                instr.lvalue.identifier,
                                visiting,
                            )
                    }
                    InstructionValue::JsxFragment { .. } => {
                        self.is_rendered(func, instr.lvalue.identifier, visiting)
                    }
                    InstructionValue::LoadLocal { place, .. } if place.identifier == id => {
                        self.is_rendered(func, instr.lvalue.identifier, visiting)
                    }
                    InstructionValue::StoreLocal { lvalue, value, .. }
                        if value.identifier == id =>
                    {
                        self.uses_of(instr.lvalue.identifier).is_empty()
                            && self.is_rendered_store_target(
                                func,
                                lvalue.place.identifier,
                                visiting,
                            )
                    }
                    _ => false,
                }
            }
        }
    }

    /// A local that an element is stored into is a rendered position if every
    /// other value stored into it is a primitive and every load of it is
    /// rendered (rule S4(d)).
    fn is_rendered_store_target(
        &self,
        func: &HirFunction,
        target: IdentifierId,
            visiting: &mut FxHashSet<IdentifierId>,
    ) -> bool {
        if self.other_defs.contains(&target) {
            return false;
        }
        let mut non_primitive_stores = 0;
        for store_id in self.store_defs.get(&target).map(|v| v.as_slice()).unwrap_or(&[]) {
            match &func.instructions[store_id.0 as usize].value {
                InstructionValue::DeclareLocal { .. } => {}
                InstructionValue::StoreLocal { value, .. } => {
                    let mut primitive_visiting = FxHashSet::default();
                    if !self.is_primitive(func, value.identifier, &mut primitive_visiting) {
                        non_primitive_stores += 1;
                    }
                }
                _ => return false,
            }
        }
        if non_primitive_stores != 1 {
            return false;
        }
        self.is_rendered(func, target, visiting)
    }

    /// Whether every value that `id` can hold is a JavaScript primitive.
    fn is_primitive(
        &self,
        func: &HirFunction,
        id: IdentifierId,
        visiting: &mut FxHashSet<IdentifierId>,
    ) -> bool {
        if !visiting.insert(id) {
            // A cycle through loads/stores introduces no new values.
            return true;
        }
        if self.other_defs.contains(&id) {
            return false;
        }
        let value_defs = self.value_defs.get(&id).map(|v| v.as_slice()).unwrap_or(&[]);
        let store_defs = self.store_defs.get(&id).map(|v| v.as_slice()).unwrap_or(&[]);
        if value_defs.is_empty() && store_defs.is_empty() {
            return false;
        }
        for def in value_defs {
            let ok = match &func.instructions[def.0 as usize].value {
                InstructionValue::Primitive { .. }
                | InstructionValue::JSXText { .. }
                | InstructionValue::BinaryExpression { .. }
                | InstructionValue::UnaryExpression { .. }
                | InstructionValue::TemplateLiteral { .. }
                | InstructionValue::PrefixUpdate { .. }
                | InstructionValue::PostfixUpdate { .. } => true,
                InstructionValue::LoadLocal { place, .. } => {
                    self.is_primitive(func, place.identifier, visiting)
                }
                InstructionValue::StoreLocal { value, .. } => {
                    self.is_primitive(func, value.identifier, visiting)
                }
                _ => false,
            };
            if !ok {
                return false;
            }
        }
        for def in store_defs {
            let ok = match &func.instructions[def.0 as usize].value {
                InstructionValue::DeclareLocal { .. } => true,
                InstructionValue::StoreLocal { value, .. } => {
                    self.is_primitive(func, value.identifier, visiting)
                }
                _ => false,
            };
            if !ok {
                return false;
            }
        }
        true
    }

    /// Rule C6 on a callee: every value `id` can hold is a non-Fragment JSX
    /// element or a primitive. Collects the element-producing instructions.
    fn collect_returned_elements(
        &self,
        func: &HirFunction,
        id: IdentifierId,
        elements: &mut Vec<InstructionId>,
        visiting: &mut FxHashSet<IdentifierId>,
    ) -> bool {
        if !visiting.insert(id) {
            return true;
        }
        if self.other_defs.contains(&id) {
            return false;
        }
        let value_defs = self.value_defs.get(&id).map(|v| v.as_slice()).unwrap_or(&[]);
        let store_defs = self.store_defs.get(&id).map(|v| v.as_slice()).unwrap_or(&[]);
        if value_defs.is_empty() && store_defs.is_empty() {
            return false;
        }
        for def in value_defs {
            let ok = match &func.instructions[def.0 as usize].value {
                InstructionValue::JsxExpression { .. } => {
                    if !elements.contains(def) {
                        elements.push(*def);
                    }
                    true
                }
                InstructionValue::Primitive { .. }
                | InstructionValue::JSXText { .. }
                | InstructionValue::BinaryExpression { .. }
                | InstructionValue::UnaryExpression { .. }
                | InstructionValue::TemplateLiteral { .. }
                | InstructionValue::PrefixUpdate { .. }
                | InstructionValue::PostfixUpdate { .. } => true,
                InstructionValue::LoadLocal { place, .. } => {
                    self.collect_returned_elements(func, place.identifier, elements, visiting)
                }
                InstructionValue::StoreLocal { value, .. } => {
                    self.collect_returned_elements(func, value.identifier, elements, visiting)
                }
                _ => false,
            };
            if !ok {
                return false;
            }
        }
        for def in store_defs {
            let ok = match &func.instructions[def.0 as usize].value {
                InstructionValue::DeclareLocal { .. } => true,
                InstructionValue::StoreLocal { value, .. } => {
                    self.collect_returned_elements(func, value.identifier, elements, visiting)
                }
                _ => false,
            };
            if !ok {
                return false;
            }
        }
        true
    }

    /// Whether `id` is only used by loads/stores that end in a `return`.
    fn flows_only_to_return(&self, func: &HirFunction, id: IdentifierId) -> bool {
        let mut visiting = FxHashSet::default();
        self.is_rendered(func, id, &mut visiting)
            && self.flows_without_jsx_containers(func, id, &mut FxHashSet::default())
    }

    fn flows_without_jsx_containers(
        &self,
        func: &HirFunction,
        id: IdentifierId,
        visiting: &mut FxHashSet<IdentifierId>,
    ) -> bool {
        if !visiting.insert(id) {
            return true;
        }
        self.uses_of(id).iter().all(|use_| match use_ {
            Use::Terminal(_) => true,
            Use::Instruction(instr_id) => {
                let instr = &func.instructions[instr_id.0 as usize];
                match &instr.value {
                    InstructionValue::LoadLocal { .. } => {
                        self.flows_without_jsx_containers(func, instr.lvalue.identifier, visiting)
                    }
                    InstructionValue::StoreLocal { lvalue, .. } => self
                        .flows_without_jsx_containers(func, lvalue.place.identifier, visiting),
                    _ => false,
                }
            }
        })
    }

    /// Rule S4(e): `callback` is only used as the only argument of a `.map(...)`
    /// call whose result is rendered, so every value it returns is an item of
    /// a rendered list.
    fn is_rendered_map_callback(&self, func: &HirFunction, callback: IdentifierId) -> bool {
        let [Use::Instruction(call_id)] = self.uses_of(callback) else {
            return false;
        };
        let call = &func.instructions[call_id.0 as usize];
        let InstructionValue::MethodCall { property, args, .. } = &call.value else {
            return false;
        };
        let [react_compiler_hir::PlaceOrSpread::Place(arg)] = args.as_slice() else {
            return false;
        };
        if arg.identifier != callback {
            return false;
        }
        let is_map = self.value_defs.get(&property.identifier).is_some_and(|defs| {
            matches!(
                defs.as_slice(),
                [def] if matches!(
                    &func.instructions[def.0 as usize].value,
                    InstructionValue::PropertyLoad {
                        property: PropertyLiteral::String(name),
                        ..
                    } if name == "map"
                )
            )
        });
        is_map && self.is_rendered(func, call.lvalue.identifier, &mut FxHashSet::default())
    }

    /// Resolves a JSX tag place to the module-local binding name it loads.
    fn module_local_tag_name<'f>(&self, func: &'f HirFunction, id: IdentifierId) -> Option<&'f str> {
        let defs = self.value_defs.get(&id)?;
        let [def] = defs.as_slice() else {
            return None;
        };
        match &func.instructions[def.0 as usize].value {
            InstructionValue::LoadGlobal {
                binding: NonLocalBinding::ModuleLocal { name },
                ..
            } => Some(name.as_str()),
            InstructionValue::LoadLocal { place, .. }
                if !self.store_defs.contains_key(&place.identifier) =>
            {
                self.module_local_tag_name(func, place.identifier)
            }
            _ => None,
        }
    }
}

/// Rule C3: the function (including nested functions) calls no hook and does
/// not call `use`.
fn function_calls_hook(func: &HirFunction, env: &Environment) -> bool {
    let flow = FlowIndex::build(func, env);
    for block in func.body.blocks.values() {
        for instr_id in &block.instructions {
            let instr = &func.instructions[instr_id.0 as usize];
            match &instr.value {
                InstructionValue::CallExpression { callee, .. } => {
                    if place_may_be_hook(func, &flow, callee.identifier, &mut FxHashSet::default())
                    {
                        return true;
                    }
                }
                InstructionValue::MethodCall { property, .. } => {
                    if place_may_be_hook(
                        func,
                        &flow,
                        property.identifier,
                        &mut FxHashSet::default(),
                    ) {
                        return true;
                    }
                }
                InstructionValue::FunctionExpression { lowered_func, .. }
                | InstructionValue::ObjectMethod { lowered_func, .. } => {
                    if function_calls_hook(&env.functions[lowered_func.func.0 as usize], env) {
                        return true;
                    }
                }
                _ => {}
            }
        }
    }
    false
}

fn is_hook_or_use_name(name: &str) -> bool {
    name == "use" || is_hook_name(name)
}

fn place_may_be_hook(
    func: &HirFunction,
    flow: &FlowIndex,
    id: IdentifierId,
    visiting: &mut FxHashSet<IdentifierId>,
) -> bool {
    if !visiting.insert(id) {
        return false;
    }
    let value_defs = flow.value_defs.get(&id).map(|v| v.as_slice()).unwrap_or(&[]);
    let store_defs = flow.store_defs.get(&id).map(|v| v.as_slice()).unwrap_or(&[]);
    for def in value_defs.iter().chain(store_defs.iter()) {
        let may_be_hook = match &func.instructions[def.0 as usize].value {
            InstructionValue::LoadGlobal { binding, .. } => {
                is_hook_or_use_name(binding.name())
                    || matches!(
                        binding,
                        NonLocalBinding::ImportSpecifier { imported, .. }
                            if is_hook_or_use_name(imported)
                    )
            }
            InstructionValue::PropertyLoad {
                property: PropertyLiteral::String(name),
                ..
            } => is_hook_or_use_name(name),
            InstructionValue::LoadLocal { place, .. } => {
                place_may_be_hook(func, flow, place.identifier, visiting)
            }
            InstructionValue::StoreLocal { value, .. } => {
                place_may_be_hook(func, flow, value.identifier, visiting)
            }
            _ => false,
        };
        if may_be_hook {
            return true;
        }
    }
    false
}

// =============================================================================
// Site selection
// =============================================================================

struct Site {
    block_id: BlockId,
    index: usize,
    component: String,
    origin: Origin,
    lvalue: Place,
    attributes: Vec<(String, Place)>,
    key: Option<Place>,
    children: Option<Vec<Place>>,
    loc: Option<react_compiler_hir::SourceLocation>,
}

fn find_site(
    func: &HirFunction,
    cx: &InlineContext<'_, '_>,
    flow: &FlowIndex,
    return_flow: ReturnFlow,
    origins: &FxHashMap<InstructionId, Origin>,
    base_origin: &Origin,
) -> Option<Site> {
    for block in func.body.blocks.values() {
        let statement_block = matches!(block.kind, BlockKind::Block | BlockKind::Catch);
        let value_block = block.kind == BlockKind::Value;
        if !statement_block && !value_block {
            continue;
        }
        for (index, instr_id) in block.instructions.iter().enumerate() {
            let instr = &func.instructions[instr_id.0 as usize];
            let InstructionValue::JsxExpression {
                tag: JsxTag::Place(tag),
                props,
                children,
                loc,
                ..
            } = &instr.value
            else {
                continue;
            };
            let Some(name) = flow.module_local_tag_name(func, tag.identifier) else {
                continue;
            };
            let Some(candidate) = cx.candidates.get(name) else {
                continue;
            };
            let origin = origins.get(instr_id).unwrap_or(base_origin);
            // Performance rule: a site written in a list callback is inlined only
            // if its component compiles to a leaf block, whose items React DOM
            // renders without fibers, or, with list item memoization, to any
            // block (items that need fibers get them individually, and each
            // item is memoized). Sites that come from inlining such a component
            // into the callback are inlined as they were when the component was
            // compiled on its own.
            let required = if cx.list_item_memoization {
                ReturnsBlock::Block
            } else {
                ReturnsBlock::LeafBlock
            };
            if return_flow == ReturnFlow::RenderedListItem
                && origin.len() == base_origin.len()
                && candidate.returns_block < required
            {
                continue;
            }
            // Rule C7 and the depth bound.
            if origin.iter().any(|n| n == name) || origin.len() >= MAX_INLINE_DEPTH {
                continue;
            }
            // Rules S1, S2 and S3.
            let mut attributes: Vec<(String, Place)> = Vec::new();
            let mut key: Option<Place> = None;
            let mut rejected = false;
            for attr in props {
                match attr {
                    JsxAttribute::SpreadAttribute { .. } => rejected = true,
                    JsxAttribute::Attribute { name, place } => match name.as_str() {
                        "ref" => rejected = true,
                        "key" => key = Some(place.clone()),
                        _ => attributes.push((name.clone(), place.clone())),
                    },
                }
            }
            if rejected || (key.is_some() && !candidate.summary.can_transfer_key) {
                continue;
            }
            // Multiple children are bound as a fragment (see
            // `CalleeSummary::children_only_rendered`).
            if children.as_ref().is_some_and(|c| c.len() > 1)
                && !candidate.summary.children_only_rendered
            {
                continue;
            }
            // Rule S5.
            if value_block
                && (!candidate.summary.single_return
                    || candidate.summary.has_statement_terminals
                    || !candidate.summary.value_site_bindable)
            {
                continue;
            }
            // Rule S4.
            if !flow.is_rendered(
                func,
                instr.lvalue.identifier,
                &mut FxHashSet::default(),
            ) {
                continue;
            }
            return Some(Site {
                block_id: block.id,
                index,
                component: name.to_string(),
                origin: origin.clone(),
                lvalue: instr.lvalue.clone(),
                attributes,
                key,
                children: children.clone(),
                loc: loc.clone(),
            });
        }
    }
    None
}

// =============================================================================
// Splicing
// =============================================================================

fn invariant(reason: &str) -> CompilerError {
    let mut err = CompilerError::new();
    err.push_error_detail(CompilerErrorDetail::new(ErrorCategory::Invariant, reason));
    err
}

fn splice_site(
    func: &mut HirFunction,
    env: &mut Environment,
    cx: &InlineContext<'_, '_>,
    site: Site,
    origins: &mut FxHashMap<InstructionId, Origin>,
) -> Result<(), CompilerError> {
    let candidate = cx
        .candidates
        .get(&site.component)
        .ok_or_else(|| invariant("InlineComponents: site references an unknown candidate"))?;

    // Lower a fresh copy of the callee into this environment. The entrypoint
    // verified that the callee compiles without errors, so any new error here
    // is a compiler bug.
    let errors_before = env.error_count();
    let mut callee = react_compiler_lowering::lower(
        &candidate.node,
        Some(&site.component),
        cx.scope_info,
        env,
    )?;
    if env.error_count() != errors_before {
        return Err(invariant(
            "InlineComponents: lowering a verified candidate recorded new errors",
        ));
    }
    let callee_summary = summarize_callee(&callee, env).map_err(|_| {
        invariant("InlineComponents: a verified candidate no longer satisfies the callee rules")
    })?;

    let site_block_kind = func.body.blocks[&site.block_id].kind;

    // Bind parameters at the start of the callee's entry block.
    let binding_mode = if site_block_kind == BlockKind::Value {
        if !callee_summary.value_site_bindable {
            return Err(invariant(
                "InlineComponents: value-block site selected for a callee whose parameters need declarations",
            ));
        }
        BindingMode::Substitute
    } else {
        BindingMode::Declare
    };
    let binding_instructions = bind_parameters(&mut callee, env, &site, binding_mode)?;

    // Move the site key onto every returned element (rule S3).
    if let Some(key) = &site.key {
        if !callee_summary.can_transfer_key {
            return Err(invariant(
                "InlineComponents: key transfer was not permitted for this callee",
            ));
        }
        let flow = FlowIndex::build(&callee, env);
        let mut returned: Vec<InstructionId> = Vec::new();
        for block in callee.body.blocks.values() {
            if let Terminal::Return { value, .. } = &block.terminal {
                flow.collect_returned_elements(
                    &callee,
                    value.identifier,
                    &mut returned,
                    &mut FxHashSet::default(),
                );
            }
        }
        for instr_id in returned {
            if let InstructionValue::JsxExpression { props, .. } =
                &mut callee.instructions[instr_id.0 as usize].value
            {
                props.insert(
                    0,
                    JsxAttribute::Attribute {
                        name: "key".to_string(),
                        place: key.clone(),
                    },
                );
            }
        }
    }

    let callee_origin: Origin = {
        let mut chain = (*site.origin).clone();
        chain.push(site.component.clone());
        Rc::new(chain)
    };

    // Move the callee's instructions into the caller, remapping their ids.
    let callee_entry = callee.body.entry;
    let callee_blocks: Vec<(BlockId, BasicBlock)> = callee.body.blocks.drain(..).collect();
    let callee_instructions: Vec<Instruction> = callee.instructions.drain(..).collect();
    let instr_offset = func.instructions.len() as u32;
    for offset in 0..callee_instructions.len() {
        origins.insert(
            InstructionId(instr_offset + offset as u32),
            callee_origin.clone(),
        );
    }
    func.instructions.extend(callee_instructions);
    let binding_ids: Vec<InstructionId> = binding_instructions
        .into_iter()
        .map(|instr| {
            let id = push_instruction(func, instr);
            origins.insert(id, callee_origin.clone());
            id
        })
        .collect();
    let mut callee_blocks: Vec<BasicBlock> = callee_blocks
        .into_iter()
        .map(|(_, mut block)| {
            for iid in &mut block.instructions {
                *iid = InstructionId(iid.0 + instr_offset);
            }
            block.preds.clear();
            block
        })
        .collect();
    for block in &mut callee_blocks {
        if block.id == callee_entry {
            let mut instructions = binding_ids.clone();
            instructions.append(&mut block.instructions);
            block.instructions = instructions;
        }
    }

    let (continuation_instructions, continuation_terminal) = {
        let block = &func.body.blocks[&site.block_id];
        (
            block.instructions[site.index + 1..].to_vec(),
            block.terminal.clone(),
        )
    };
    func.body
        .blocks
        .get_mut(&site.block_id)
        .unwrap()
        .instructions
        .truncate(site.index);

    if site_block_kind == BlockKind::Value {
        splice_into_value_block(
            func,
            &site,
            callee_entry,
            callee_blocks,
            &callee_summary,
            continuation_instructions,
            continuation_terminal,
            &callee_origin,
            origins,
        )?;
    } else {
        splice_into_statement_block(
            func,
            env,
            &site,
            callee_entry,
            callee_blocks,
            &callee_summary,
            continuation_instructions,
            continuation_terminal,
            &callee_origin,
            origins,
        );
    }

    func.body.blocks = get_reverse_postordered_blocks(&func.body, &func.instructions);
    mark_instruction_ids(&mut func.body, &mut func.instructions);
    mark_predecessors(&mut func.body);
    merge_consecutive_blocks(func, &mut env.functions);
    Ok(())
}

/// Splices the callee at a statement-level site, using the shapes of
/// `InlineImmediatelyInvokedFunctionExpressions`: a goto for a callee with a
/// single return, otherwise a labeled block whose returns assign the result
/// and break to the continuation.
#[allow(clippy::too_many_arguments)]
fn splice_into_statement_block(
    func: &mut HirFunction,
    env: &mut Environment,
    site: &Site,
    callee_entry: BlockId,
    callee_blocks: Vec<BasicBlock>,
    callee_summary: &CalleeSummary,
    continuation_instructions: Vec<InstructionId>,
    continuation_terminal: Terminal,
    callee_origin: &Origin,
    origins: &mut FxHashMap<InstructionId, Origin>,
) {
    let site_block_kind = func.body.blocks[&site.block_id].kind;
    let block_terminal_id = continuation_terminal.evaluation_order();
    let block_terminal_loc = continuation_terminal.loc().cloned();
    let continuation_block_id = env.next_block_id();
    func.body.blocks.insert(
        continuation_block_id,
        BasicBlock {
            id: continuation_block_id,
            instructions: continuation_instructions,
            kind: site_block_kind,
            phis: Vec::new(),
            preds: IndexSet::default(),
            terminal: continuation_terminal,
        },
    );

    let single_return = callee_summary.single_return;
    if single_return {
        func.body.blocks.get_mut(&site.block_id).unwrap().terminal = Terminal::Goto {
            block: callee_entry,
            id: block_terminal_id,
            loc: block_terminal_loc,
            variant: GotoVariant::Break,
        };
    } else {
        func.body.blocks.get_mut(&site.block_id).unwrap().terminal = Terminal::Label {
            block: callee_entry,
            id: EvaluationOrder(0),
            fallthrough: continuation_block_id,
            loc: block_terminal_loc,
        };
        let declare_lvalue = create_temporary_place(env, site.loc.clone());
        let declare_id = push_instruction(
            func,
            Instruction {
                id: EvaluationOrder(0),
                loc: GENERATED_SOURCE,
                lvalue: declare_lvalue,
                value: InstructionValue::DeclareLocal {
                    lvalue: LValue {
                        place: site.lvalue.clone(),
                        kind: InstructionKind::Let,
                    },
                    type_annotation: None,
                    loc: site.loc.clone(),
                },
                effects: None,
            },
        );
        origins.insert(declare_id, site.origin.clone());
        func.body
            .blocks
            .get_mut(&site.block_id)
            .unwrap()
            .instructions
            .push(declare_id);
        let identifier = &mut env.identifiers[site.lvalue.identifier.0 as usize];
        if identifier.name.is_none() {
            identifier.name = Some(IdentifierName::Promoted(format!(
                "#t{}",
                identifier.declaration_id.0
            )));
        }
    }

    for mut block in callee_blocks {
        if let Terminal::Return {
            value,
            id: return_id,
            loc: return_loc,
            ..
        } = &block.terminal
        {
            let (value, return_id, return_loc) = (value.clone(), *return_id, return_loc.clone());
            let result_instr = if single_return {
                load_result(site, value, return_loc.clone())
            } else {
                Instruction {
                    id: EvaluationOrder(0),
                    loc: return_loc.clone(),
                    lvalue: create_temporary_place(env, return_loc.clone()),
                    value: InstructionValue::StoreLocal {
                        lvalue: LValue {
                            kind: InstructionKind::Reassign,
                            place: site.lvalue.clone(),
                        },
                        value,
                        type_annotation: None,
                        loc: return_loc.clone(),
                    },
                    effects: None,
                }
            };
            let result_id = push_instruction(func, result_instr);
            origins.insert(result_id, callee_origin.clone());
            block.instructions.push(result_id);
            block.terminal = Terminal::Goto {
                block: continuation_block_id,
                id: return_id,
                loc: return_loc,
                variant: GotoVariant::Break,
            };
        }
        func.body.blocks.insert(block.id, block);
    }
}

/// Splices the callee at a site inside a value block (e.g. the right-hand
/// side of `cond && <C />`). Value blocks may contain expression terminals but
/// no gotos between blocks, so the callee's entry block is merged into the
/// site block and the continuation is appended to the callee's single return
/// block, exactly as lowering would have produced for an inline expression.
#[allow(clippy::too_many_arguments)]
fn splice_into_value_block(
    func: &mut HirFunction,
    site: &Site,
    callee_entry: BlockId,
    callee_blocks: Vec<BasicBlock>,
    callee_summary: &CalleeSummary,
    mut continuation_instructions: Vec<InstructionId>,
    continuation_terminal: Terminal,
    callee_origin: &Origin,
    origins: &mut FxHashMap<InstructionId, Origin>,
) -> Result<(), CompilerError> {
    if !callee_summary.single_return || callee_summary.has_statement_terminals {
        return Err(invariant(
            "InlineComponents: value-block site selected for a callee with statement-level control flow",
        ));
    }
    let site_block_kind = func.body.blocks[&site.block_id].kind;
    let mut entry_block: Option<BasicBlock> = None;
    let mut other_blocks: Vec<BasicBlock> = Vec::new();
    for mut block in callee_blocks {
        if block.kind == BlockKind::Block {
            block.kind = site_block_kind;
        }
        if let Terminal::Return {
            value, loc: return_loc, ..
        } = &block.terminal
        {
            let result_id = push_instruction(func, load_result(site, value.clone(), return_loc.clone()));
            origins.insert(result_id, callee_origin.clone());
            block.instructions.push(result_id);
            block.instructions.append(&mut continuation_instructions);
            block.terminal = continuation_terminal.clone();
        }
        if block.id == callee_entry {
            entry_block = Some(block);
        } else {
            other_blocks.push(block);
        }
    }
    let entry_block = entry_block
        .ok_or_else(|| invariant("InlineComponents: callee has no entry block"))?;

    // Merge the callee entry block into the site block.
    let site_block = func.body.blocks.get_mut(&site.block_id).unwrap();
    site_block.instructions.extend(entry_block.instructions);
    site_block.terminal = entry_block.terminal;
    for block in other_blocks {
        func.body.blocks.insert(block.id, block);
    }
    Ok(())
}

fn load_result(
    site: &Site,
    value: Place,
    loc: Option<react_compiler_hir::SourceLocation>,
) -> Instruction {
    Instruction {
        id: EvaluationOrder(0),
        loc: loc.clone(),
        lvalue: site.lvalue.clone(),
        value: InstructionValue::LoadLocal { place: value, loc },
        effects: None,
    }
}

fn push_instruction(func: &mut HirFunction, instr: Instruction) -> InstructionId {
    let id = InstructionId(func.instructions.len() as u32);
    func.instructions.push(instr);
    id
}

/// Builds the instructions that bind the callee's parameter to the site's
/// attributes, following React's props construction: `key` and `ref` are not
/// props, and `children` is absent, the single child, or an array of children
/// (JSX children take precedence over a `children` attribute).
///
/// A destructured props parameter is bound property by property and the
/// callee's `Destructure` instruction is removed, so no props object is
/// allocated. Otherwise the parameter is bound to a new props object.
///
/// With [`BindingMode::Declare`] each binding is a `StoreLocal`. With
/// [`BindingMode::Substitute`] (value blocks, which cannot declare variables)
/// the single load of each binding is redirected to the bound value; the
/// callee must satisfy `CalleeSummary::value_site_bindable`.
fn bind_parameters(
    callee: &mut HirFunction,
    env: &mut Environment,
    site: &Site,
    mode: BindingMode,
) -> Result<Vec<Instruction>, CompilerError> {
    let param = match callee.params.as_slice() {
        [] => return Ok(Vec::new()),
        [ParamPattern::Place(place)] => place.clone(),
        _ => {
            return Err(invariant(
                "InlineComponents: callee parameters were not validated",
            ));
        }
    };

    let mut instructions: Vec<Instruction> = Vec::new();
    let mut props: Vec<(String, Place)> = Vec::new();
    let has_children = site.children.as_ref().is_some_and(|c| !c.is_empty());
    for (name, place) in &site.attributes {
        if has_children && name == "children" {
            continue;
        }
        props.push((name.clone(), place.clone()));
    }
    if let Some(children) = &site.children {
        match children.as_slice() {
            [] => {}
            [child] => props.push(("children".to_string(), child.clone())),
            many => {
                let fragment = create_temporary_place(env, site.loc.clone());
                instructions.push(Instruction {
                    id: EvaluationOrder(0),
                    loc: site.loc.clone(),
                    lvalue: fragment.clone(),
                    value: InstructionValue::JsxFragment {
                        children: many.to_vec(),
                        loc: site.loc.clone(),
                    },
                    effects: None,
                });
                props.push(("children".to_string(), fragment));
            }
        }
    }

    if let Some(destructure) = find_param_destructure(callee, env, param.identifier) {
        let (instr_index, kind, properties) = destructure;
        let entry = callee.body.entry;
        callee
            .body
            .blocks
            .get_mut(&entry)
            .unwrap()
            .instructions
            .remove(instr_index);
        let mut bound_names: FxHashSet<String> = FxHashSet::default();
        for property in properties {
            match property {
                DestructuredProperty::Named { name, place } => {
                    let value = match props.iter().rev().find(|(n, _)| *n == name) {
                        Some((_, value)) => value.clone(),
                        None => {
                            let undefined = create_temporary_place(env, site.loc.clone());
                            instructions.push(Instruction {
                                id: EvaluationOrder(0),
                                loc: site.loc.clone(),
                                lvalue: undefined.clone(),
                                value: InstructionValue::Primitive {
                                    value: PrimitiveValue::Undefined,
                                    loc: site.loc.clone(),
                                },
                                effects: None,
                            });
                            undefined
                        }
                    };
                    bound_names.insert(name);
                    bind(callee, env, &mut instructions, mode, kind, place, value, site)?;
                }
                DestructuredProperty::Rest { place } => {
                    let remaining: Vec<(String, Place)> = props
                        .iter()
                        .filter(|(n, _)| !bound_names.contains(n))
                        .cloned()
                        .collect();
                    let object = object_expression(env, &mut instructions, remaining, site);
                    bind(callee, env, &mut instructions, mode, kind, place, object, site)?;
                }
            }
        }
        return Ok(instructions);
    }

    if mode == BindingMode::Substitute {
        return Err(invariant(
            "InlineComponents: substitution binding requires a destructured parameter",
        ));
    }
    let object = object_expression(env, &mut instructions, props, site);
    instructions.push(store(env, InstructionKind::Const, param, object, site));
    Ok(instructions)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BindingMode {
    Declare,
    Substitute,
}

#[allow(clippy::too_many_arguments)]
fn bind(
    callee: &mut HirFunction,
    env: &mut Environment,
    instructions: &mut Vec<Instruction>,
    mode: BindingMode,
    kind: InstructionKind,
    place: Place,
    value: Place,
    site: &Site,
) -> Result<(), CompilerError> {
    match mode {
        BindingMode::Declare => {
            instructions.push(store(env, kind, place, value, site));
        }
        BindingMode::Substitute => {
            let mut loads = 0;
            for instr in &mut callee.instructions {
                if let InstructionValue::LoadLocal { place: loaded, .. } = &mut instr.value {
                    if loaded.identifier == place.identifier {
                        loaded.identifier = value.identifier;
                        loads += 1;
                    }
                }
            }
            if loads > 1 {
                return Err(invariant(
                    "InlineComponents: substituted binding is loaded more than once",
                ));
            }
        }
    }
    Ok(())
}

/// See `CalleeSummary::value_site_bindable`.
fn is_value_site_bindable(func: &HirFunction, env: &Environment, flow: &FlowIndex) -> bool {
    let destructure = match func.params.as_slice() {
        [] => None,
        [ParamPattern::Place(param)] => match find_param_destructure(func, env, param.identifier)
        {
            Some(destructure) => Some(destructure),
            None => return false,
        },
        _ => return false,
    };
    let entry = &func.body.blocks[&func.body.entry];
    let destructure_instr = destructure
        .as_ref()
        .map(|(index, _, _)| entry.instructions[*index]);
    if let Some((_, _, properties)) = &destructure {
        for property in properties {
            let place = match property {
                DestructuredProperty::Named { place, .. } | DestructuredProperty::Rest { place } => {
                    place
                }
            };
            if flow.store_defs.contains_key(&place.identifier)
                || flow.value_defs.contains_key(&place.identifier)
            {
                return false;
            }
            match flow.uses_of(place.identifier) {
                [] => {}
                [Use::Instruction(instr_id)] => {
                    if !matches!(
                        func.instructions[instr_id.0 as usize].value,
                        InstructionValue::LoadLocal { .. }
                    ) {
                        return false;
                    }
                }
                _ => return false,
            }
        }
    }
    // No other instruction may declare or assign a named variable.
    for block in func.body.blocks.values() {
        for instr_id in &block.instructions {
            if Some(*instr_id) == destructure_instr {
                continue;
            }
            let instr = &func.instructions[instr_id.0 as usize];
            let named = |place: &Place| env.identifiers[place.identifier.0 as usize].name.is_some();
            if named(&instr.lvalue) {
                return false;
            }
            let assigns_named = match &instr.value {
                InstructionValue::StoreLocal { lvalue, .. }
                | InstructionValue::DeclareLocal { lvalue, .. }
                | InstructionValue::StoreContext { lvalue, .. }
                | InstructionValue::DeclareContext { lvalue, .. } => named(&lvalue.place),
                other => visitors::each_instruction_value_lvalue(other)
                    .iter()
                    .any(|place| named(place)),
            };
            if assigns_named {
                return false;
            }
        }
    }
    true
}

enum DestructuredProperty {
    Named { name: String, place: Place },
    Rest { place: Place },
}

/// Matches a callee whose entry block starts with `Destructure {..} = param`,
/// where `param` has no other uses and the pattern only contains named
/// properties and an optional trailing rest element.
fn find_param_destructure(
    callee: &HirFunction,
    env: &Environment,
    param: IdentifierId,
) -> Option<(usize, InstructionKind, Vec<DestructuredProperty>)> {
    let flow = FlowIndex::build(callee, env);
    if flow.uses_of(param).len() != 1 {
        return None;
    }
    let entry = &callee.body.blocks[&callee.body.entry];
    let (index, instr_id) = entry.instructions.iter().enumerate().find(|(_, id)| {
        let instr = &callee.instructions[id.0 as usize];
        visitors::each_instruction_value_operand(&instr.value, env)
            .iter()
            .any(|p| p.identifier == param)
    })?;
    let instr = &callee.instructions[instr_id.0 as usize];
    let InstructionValue::Destructure { lvalue, value, .. } = &instr.value else {
        return None;
    };
    if value.identifier != param || !flow.uses_of(instr.lvalue.identifier).is_empty() {
        return None;
    }
    let Pattern::Object(pattern) = &lvalue.pattern else {
        return None;
    };
    let mut properties = Vec::new();
    let count = pattern.properties.len();
    for (i, property) in pattern.properties.iter().enumerate() {
        match property {
            ObjectPropertyOrSpread::Property(ObjectProperty {
                key,
                property_type: ObjectPropertyType::Property,
                place,
            }) => {
                let name = match key {
                    ObjectPropertyKey::Identifier { name } | ObjectPropertyKey::String { name } => {
                        name.clone()
                    }
                    _ => return None,
                };
                properties.push(DestructuredProperty::Named {
                    name,
                    place: place.clone(),
                });
            }
            ObjectPropertyOrSpread::Spread(spread) if i + 1 == count => {
                properties.push(DestructuredProperty::Rest {
                    place: spread.place.clone(),
                });
            }
            _ => return None,
        }
    }
    Some((index, lvalue.kind, properties))
}

fn store(
    env: &mut Environment,
    kind: InstructionKind,
    place: Place,
    value: Place,
    site: &Site,
) -> Instruction {
    Instruction {
        id: EvaluationOrder(0),
        loc: site.loc.clone(),
        lvalue: create_temporary_place(env, site.loc.clone()),
        value: InstructionValue::StoreLocal {
            lvalue: LValue { kind, place },
            value,
            type_annotation: None,
            loc: site.loc.clone(),
        },
        effects: None,
    }
}

fn object_expression(
    env: &mut Environment,
    instructions: &mut Vec<Instruction>,
    props: Vec<(String, Place)>,
    site: &Site,
) -> Place {
    let object = create_temporary_place(env, site.loc.clone());
    instructions.push(Instruction {
        id: EvaluationOrder(0),
        loc: site.loc.clone(),
        lvalue: object.clone(),
        value: InstructionValue::ObjectExpression {
            properties: props
                .into_iter()
                .map(|(name, place)| {
                    let key = if is_identifier_name(&name) {
                        ObjectPropertyKey::Identifier { name }
                    } else {
                        ObjectPropertyKey::String { name }
                    };
                    ObjectPropertyOrSpread::Property(ObjectProperty {
                        key,
                        property_type: ObjectPropertyType::Property,
                        place,
                    })
                })
                .collect(),
            loc: site.loc.clone(),
        },
        effects: None,
    });
    object
}

fn is_identifier_name(name: &str) -> bool {
    let mut chars = name.chars();
    match chars.next() {
        Some(c) if c == '_' || c == '$' || c.is_ascii_alphabetic() => {}
        _ => return false,
    }
    chars.all(|c| c == '_' || c == '$' || c.is_ascii_alphanumeric())
}
