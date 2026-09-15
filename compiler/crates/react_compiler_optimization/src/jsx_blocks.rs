// Copyright (c) Meta Platforms, Inc. and affiliates.
//
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.

//! Compiles trees of host JSX elements into compiled DOM blocks.
//!
//! ```text
//! <li className={className}>
//!   <div className="view">
//!     <label onDoubleClick={onEdit}>{title}</label>
//!   </div>
//! </li>
//!
//! =>
//!
//! // module scope
//! const BlockTemplate = unstable_createBlockTemplate(
//!   ["li", null, [["className", 0]], [
//!     ["div", {className: "view"}, null, [
//!       ["label", null, [["onDoubleClick", 1]], [{s: 2}]]]]]]);
//! // in the component
//! <BlockTemplate v={[className, onEdit, title]} />
//! ```
//!
//! The static structure of the tree is created once per document by React DOM
//! and cloned per instance; only the numbered holes are compared and patched
//! on update. The replacement is an ordinary JSX element whose tag is the
//! module-scope template, so memoization and every other pass treat it like
//! any other element.
//!
//! An element joins a block only when React DOM renders it the same way from a
//! template as from a host component. The rules are documented in
//! `compiler/docs/experiments/0002-compiled-blocks.md`.
//!
//! The pass runs on SSA form, after type inference, on the component and on
//! every nested function.

use rustc_hash::{FxHashMap, FxHashSet};

use react_compiler_diagnostics::JsString;
use react_compiler_hir::block_template::{BlockChild, BlockNode, BlockStaticValue, ReturnsBlock};
use react_compiler_hir::environment::Environment;
use react_compiler_hir::visitors;
use react_compiler_hir::{
    ArrayElement, BinaryOperator, EvaluationOrder, FunctionId, HirFunction, IdentifierId,
    Instruction, InstructionId, InstructionValue, JsxAttribute, JsxTag, NonLocalBinding, Place,
    PrimitiveValue, ReactFunctionType, Terminal, Type, UnaryOperator, is_jsx_type,
};
use react_compiler_lowering::create_temporary_place;

use crate::jsx_block_positions::Positions;

/// HTML elements whose rendering React DOM does not special-case, so a
/// template clone with `setProp` applied is identical to a host component.
/// `input` is supported: React DOM applies all of its props through its own
/// input handling (controlled values, value tracking, change events).
/// Excluded on purpose: `textarea` and `select` (children and default values),
/// `form` (actions), media and `img` (non-delegated load/error listeners),
/// hoistables and singletons (`title`, `meta`, `link`, `style`, `script`,
/// `html`, `head`, `body`), `select`/`option`, `details`/`dialog` (toggle
/// events), custom elements and SVG/MathML (namespaces).
const BLOCK_TAGS: &[&str] = &[
    "a", "abbr", "article", "aside", "b", "blockquote", "br", "button", "caption", "cite",
    "code", "dd", "del", "div", "dl", "dt", "em", "figcaption", "figure", "footer", "h1", "h2",
    "h3", "h4", "h5", "h6", "header", "hr", "i", "input", "ins", "kbd", "label", "legend", "li",
    "main",
    "mark", "nav", "ol", "p", "pre", "q", "s", "section", "small", "span", "strong", "sub",
    "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr", "u", "ul",
];

/// Props whose handling depends on other props, on commit-time effects or on
/// non-delegated listeners. An element with any of them is not compiled.
const EXCLUDED_PROPS: &[&str] = &[
    "ref",
    "children",
    "dangerouslySetInnerHTML",
    "suppressContentEditableWarning",
    "suppressHydrationWarning",
    "autoFocus",
    "action",
    "formAction",
    "popover",
    "popoverTarget",
    "popoverTargetAction",
    "contentEditable",
    "innerHTML",
    "innerText",
    "textContent",
];

/// Events dispatched by React DOM's SimpleEventPlugin through delegated,
/// bubbling root listeners (the only kind a block node can carry).
const BLOCK_EVENTS: &[&str] = &[
    "onAuxClick",
    "onClick",
    "onContextMenu",
    "onCopy",
    "onCut",
    "onDoubleClick",
    "onDrag",
    "onDragEnd",
    "onDragEnter",
    "onDragExit",
    "onDragLeave",
    "onDragOver",
    "onDragStart",
    "onDrop",
    "onFocus",
    "onBlur",
    "onKeyDown",
    "onKeyPress",
    "onKeyUp",
    "onMouseDown",
    "onMouseMove",
    "onMouseOut",
    "onMouseOver",
    "onMouseUp",
    "onPaste",
    "onPointerDown",
    "onPointerMove",
    "onPointerOut",
    "onPointerOver",
    "onPointerUp",
    "onTouchCancel",
    "onTouchEnd",
    "onTouchMove",
    "onTouchStart",
    "onWheel",
];

/// Props of form controls that only `input` handles; any other element with
/// them is not compiled.
const INPUT_ONLY_PROPS: &[&str] = &["value", "defaultValue", "checked", "defaultChecked"];

/// Events dispatched through two-phase plugin listeners (change, select,
/// before-input) or, for `invalid`, a listener React DOM attaches to inputs.
const FORM_EVENTS: &[&str] = &[
    "onBeforeInput",
    "onChange",
    "onCompositionEnd",
    "onCompositionStart",
    "onCompositionUpdate",
    "onInput",
    "onInvalid",
    "onSelect",
];

/// Interactive elements for which React DOM suppresses mouse events when they
/// have a `disabled` prop (see `getListener`).
const INTERACTIVE_TAGS: &[&str] = &["button", "input"];

/// Compile host JSX trees in `func` and all of its nested functions into
/// compiled blocks. Returns the number of blocks created.
///
/// Also records on the environment what `func` returns in terms of blocks
/// (see `ReturnsBlock`), the values that `func` places into block slots, and
/// which nested functions return blocks (both used by `MemoizeListItems`).
pub fn compile_jsx_blocks(func: &mut HirFunction, env: &mut Environment) -> usize {
    // A component's return value is rendered at the component's position.
    let returns_rendered = func.fn_type == ReactFunctionType::Component;
    // Rendered positions are determined on the original elements, before the
    // function's elements become blocks.
    let rendered_list_callbacks =
        Positions::build(func, env, returns_rendered).rendered_list_callbacks();
    let result = compile_blocks_in_function(func, env, returns_rendered);
    env.set_returns_block(result.returns_block);
    env.set_block_slot_values(result.slot_values);
    result.created + compile_nested_jsx_blocks(func, env, &rendered_list_callbacks)
}

fn compile_nested_jsx_blocks(
    func: &mut HirFunction,
    env: &mut Environment,
    rendered_list_callbacks: &FxHashSet<FunctionId>,
) -> usize {
    let mut count = 0;
    let nested: Vec<FunctionId> = func
        .instructions
        .iter()
        .filter_map(|instr| match &instr.value {
            InstructionValue::FunctionExpression { lowered_func, .. }
            | InstructionValue::ObjectMethod { lowered_func, .. } => Some(lowered_func.func),
            _ => None,
        })
        .collect();
    for func_id in nested {
        let mut inner = std::mem::replace(
            &mut env.functions[func_id.0 as usize],
            react_compiler_ssa::enter_ssa::placeholder_function(),
        );
        let inner_returns_rendered = rendered_list_callbacks.contains(&func_id);
        let inner_list_callbacks =
            Positions::build(&inner, env, inner_returns_rendered).rendered_list_callbacks();
        let result = compile_blocks_in_function(&mut inner, env, inner_returns_rendered);
        count += result.created;
        if result.returns_block >= ReturnsBlock::Block {
            env.add_block_function(func_id);
        }
        count += compile_nested_jsx_blocks(&mut inner, env, &inner_list_callbacks);
        env.functions[func_id.0 as usize] = inner;
    }
    count
}

struct Uses {
    /// Number of times each identifier is used as an operand anywhere in the
    /// function (instructions, terminals and phis).
    counts: FxHashMap<IdentifierId, usize>,
    /// The instruction that defines each instruction lvalue.
    defs: FxHashMap<IdentifierId, InstructionId>,
    /// The value stored into each `StoreLocal` target (single assignment in
    /// SSA form).
    stores: FxHashMap<IdentifierId, IdentifierId>,
}

impl Uses {
    fn build(func: &HirFunction, env: &Environment) -> Self {
        let mut uses = Uses {
            counts: FxHashMap::default(),
            defs: FxHashMap::default(),
            stores: FxHashMap::default(),
        };
        for block in func.body.blocks.values() {
            for phi in &block.phis {
                for operand in phi.operands.values() {
                    *uses.counts.entry(operand.identifier).or_default() += 1;
                }
            }
            for instr_id in &block.instructions {
                let instr = &func.instructions[instr_id.0 as usize];
                uses.defs.insert(instr.lvalue.identifier, *instr_id);
                if let InstructionValue::StoreLocal { lvalue, value, .. } = &instr.value {
                    uses.stores.insert(lvalue.place.identifier, value.identifier);
                }
                for place in visitors::each_instruction_value_operand(&instr.value, env) {
                    *uses.counts.entry(place.identifier).or_default() += 1;
                }
            }
            for place in visitors::each_terminal_operand(&block.terminal) {
                *uses.counts.entry(place.identifier).or_default() += 1;
            }
        }
        uses
    }

    fn count(&self, id: IdentifierId) -> usize {
        self.counts.get(&id).copied().unwrap_or(0)
    }

    fn def<'f>(&self, func: &'f HirFunction, id: IdentifierId) -> Option<&'f Instruction> {
        self.defs
            .get(&id)
            .map(|instr_id| &func.instructions[instr_id.0 as usize])
    }

    /// Follows single-use `LoadLocal`s of temporaries (as left by inlining) to
    /// the instruction that produces the value of `id`. Returns that
    /// instruction and the loads passed through, which become dead if the value
    /// is absorbed into a block.
    fn resolve_single_use(
        &self,
        func: &HirFunction,
        id: IdentifierId,
    ) -> Option<(InstructionId, Vec<InstructionId>)> {
        let mut loads = Vec::new();
        let mut current = id;
        loop {
            if self.count(current) != 1 {
                return None;
            }
            let instr_id = *self.defs.get(&current)?;
            match &func.instructions[instr_id.0 as usize].value {
                InstructionValue::LoadLocal { place, .. } => {
                    loads.push(instr_id);
                    current = place.identifier;
                }
                _ => return Some((instr_id, loads)),
            }
        }
    }
}

/// A host element that may be part of a block, with its props classified.
struct Candidate {
    tag: String,
    key: Option<Place>,
    static_props: Vec<(String, BlockStaticValue)>,
    dynamic_props: Vec<(String, Place)>,
    children: Vec<Place>,
}

struct FunctionBlocks {
    created: usize,
    /// What the function returns in terms of blocks.
    returns_block: ReturnsBlock,
    /// The values placed into slots of the created blocks.
    slot_values: FxHashSet<IdentifierId>,
}

/// Compiles the blocks of one function.
fn compile_blocks_in_function(
    func: &mut HirFunction,
    env: &mut Environment,
    returns_rendered: bool,
) -> FunctionBlocks {
    let uses = Uses::build(func, env);

    // Classify every host JSX element.
    let mut candidates: FxHashMap<InstructionId, Candidate> = FxHashMap::default();
    for block in func.body.blocks.values() {
        for instr_id in &block.instructions {
            let instr = &func.instructions[instr_id.0 as usize];
            if let Some(candidate) = classify_element(func, &uses, instr) {
                candidates.insert(*instr_id, candidate);
            }
        }
    }

    // An element is absorbed into its parent when it is a candidate without a
    // key whose only use is as a child of a candidate parent.
    let mut absorbed: FxHashSet<InstructionId> = FxHashSet::default();
    for candidate in candidates.values() {
        for child in &candidate.children {
            if let Some((child_id, _)) = uses.resolve_single_use(func, child.identifier) {
                if let Some(child_candidate) = candidates.get(&child_id) {
                    if child_candidate.key.is_none() {
                        absorbed.insert(child_id);
                    }
                }
            }
        }
    }

    // Roots, in instruction order for deterministic template names. A root is
    // only compiled at a position where no other element with its tag can be
    // rendered, since a block has a different type than a host element (see
    // jsx_block_positions).
    let positions = Positions::build(func, env, returns_rendered);
    let mut roots: Vec<InstructionId> = candidates
        .iter()
        .filter(|(id, candidate)| {
            !absorbed.contains(id)
                && positions.is_exclusive(
                    func.instructions[id.0 as usize].lvalue.identifier,
                    &candidate.tag,
                )
        })
        .map(|(id, _)| *id)
        .collect();
    drop(positions);
    roots.sort_by_key(|id| id.0);

    let mut created = 0;
    let mut slot_values: FxHashSet<IdentifierId> = FxHashSet::default();
    // The lvalue of each created block element, and whether it is a leaf block.
    let mut block_elements: FxHashMap<IdentifierId, bool> = FxHashMap::default();
    let mut removed: FxHashSet<InstructionId> = FxHashSet::default();
    let mut insertions: FxHashMap<InstructionId, Vec<Instruction>> = FxHashMap::default();
    for root_id in roots {
        let root_candidate = &candidates[&root_id];
        let mut builder = TreeBuilder {
            func,
            uses: &uses,
            candidates: &candidates,
            absorbed: &absorbed,
            holes: Vec::new(),
            slot_holes: Vec::new(),
            removed: Vec::new(),
            element_count: 0,
        };
        let root_node = builder.build(root_id);
        // A single element renders as one fiber either way; a block only pays
        // off when it replaces several host fibers, or when it renders a list
        // (whose items the block renders without fibers).
        let renders_list = builder
            .slot_holes
            .iter()
            .any(|place| is_map_call(func, &uses, place.identifier));
        if builder.element_count < 2 && !renders_list {
            continue;
        }
        slot_values.extend(builder.slot_holes.iter().map(|place| place.identifier));
        let is_leaf = builder.slot_holes.iter().all(|place| {
            let type_id = env.identifiers[place.identifier.0 as usize].type_;
            !type_may_be_jsx(&env.types[type_id.0 as usize])
        });
        let holes = builder.holes;
        removed.extend(builder.removed);

        let name = env.add_block_template(root_node);

        let root_instr = &func.instructions[root_id.0 as usize];
        block_elements.insert(root_instr.lvalue.identifier, is_leaf);
        let loc = root_instr.loc.clone();
        let key = root_candidate.key.clone();
        let values_place = create_temporary_place(env, loc.clone());
        let template_place = create_temporary_place(env, loc.clone());
        insertions.insert(
            root_id,
            vec![
                Instruction {
                    id: EvaluationOrder(0),
                    loc: loc.clone(),
                    lvalue: values_place.clone(),
                    value: InstructionValue::ArrayExpression {
                        elements: holes.into_iter().map(ArrayElement::Place).collect(),
                        loc: loc.clone(),
                    },
                    effects: None,
                },
                Instruction {
                    id: EvaluationOrder(0),
                    loc: loc.clone(),
                    lvalue: template_place.clone(),
                    value: InstructionValue::LoadGlobal {
                        binding: NonLocalBinding::ModuleLocal { name },
                        loc: loc.clone(),
                    },
                    effects: None,
                },
            ],
        );
        let mut props = Vec::new();
        if let Some(key) = key {
            props.push(JsxAttribute::Attribute {
                name: "key".to_string(),
                place: key,
            });
        }
        props.push(JsxAttribute::Attribute {
            name: "v".to_string(),
            place: values_place,
        });
        let root_instr = &mut func.instructions[root_id.0 as usize];
        root_instr.value = InstructionValue::JsxExpression {
            tag: JsxTag::Place(template_place),
            props,
            children: None,
            loc: loc.clone(),
            opening_loc: loc.clone(),
            closing_loc: None,
        };
        created += 1;
    }

    if created > 0 {
        for block in func.body.blocks.values_mut() {
            let mut instructions = Vec::with_capacity(block.instructions.len());
            for instr_id in block.instructions.drain(..) {
                if removed.contains(&instr_id) {
                    continue;
                }
                if let Some(new_instructions) = insertions.remove(&instr_id) {
                    for instr in new_instructions {
                        let id = InstructionId(func.instructions.len() as u32);
                        func.instructions.push(instr);
                        instructions.push(id);
                    }
                }
                instructions.push(instr_id);
            }
            block.instructions = instructions;
        }
        react_compiler_lowering::mark_instruction_ids(&mut func.body, &mut func.instructions);
    }
    let returns_block = returns_block(func, &uses, &block_elements);
    FunctionBlocks {
        created,
        returns_block,
        slot_values,
    }
}

/// Whether a value of this type may be a JSX element: a JSX type, or a phi with
/// such an operand.
fn type_may_be_jsx(ty: &Type) -> bool {
    match ty {
        Type::Phi { operands } => operands.iter().any(type_may_be_jsx),
        _ => is_jsx_type(ty),
    }
}

/// What the function returns: whether it returns at least once and every
/// returned value (following local stores and loads) is a block element, and
/// whether all of those are leaf blocks (no slot ever holds a JSX element).
fn returns_block(
    func: &HirFunction,
    uses: &Uses,
    block_elements: &FxHashMap<IdentifierId, bool>,
) -> ReturnsBlock {
    let mut returns = 0;
    let mut all_leaf = true;
    for block in func.body.blocks.values() {
        let Terminal::Return { value, .. } = &block.terminal else {
            continue;
        };
        returns += 1;
        let mut current = value.identifier;
        let is_leaf = loop {
            if let Some(is_leaf) = block_elements.get(&current) {
                break Some(*is_leaf);
            }
            if let Some(stored) = uses.stores.get(&current) {
                current = *stored;
                continue;
            }
            match uses.def(func, current).map(|instr| &instr.value) {
                Some(InstructionValue::LoadLocal { place, .. }) => current = place.identifier,
                _ => break None,
            }
        };
        match is_leaf {
            None => return ReturnsBlock::No,
            Some(false) => all_leaf = false,
            Some(true) => {}
        }
    }
    if returns == 0 {
        ReturnsBlock::No
    } else if all_leaf {
        ReturnsBlock::LeafBlock
    } else {
        ReturnsBlock::Block
    }
}

struct TreeBuilder<'a> {
    func: &'a HirFunction,
    uses: &'a Uses,
    candidates: &'a FxHashMap<InstructionId, Candidate>,
    absorbed: &'a FxHashSet<InstructionId>,
    holes: Vec<Place>,
    /// The places of the slot holes.
    slot_holes: Vec<Place>,
    removed: Vec<InstructionId>,
    element_count: usize,
}

impl TreeBuilder<'_> {
    fn hole(&mut self, place: &Place) -> u32 {
        self.holes.push(place.clone());
        (self.holes.len() - 1) as u32
    }

    fn build(&mut self, instr_id: InstructionId) -> BlockNode {
        let candidate = &self.candidates[&instr_id];
        self.element_count += 1;
        let dynamic_props: Vec<(String, u32)> = candidate
            .dynamic_props
            .iter()
            .map(|(name, place)| (name.clone(), self.hole(place)))
            .collect();
        let mut children = Vec::new();
        for child in &candidate.children {
            let def = self.uses.def(self.func, child.identifier);
            match def.map(|instr| &instr.value) {
                Some(InstructionValue::JSXText { value, .. }) => {
                    if !value.is_empty() {
                        children.push(BlockChild::Text(JsString::from(value.as_str())));
                    }
                }
                Some(InstructionValue::Primitive { value, .. }) => {
                    match static_text(value) {
                        StaticText::Text(text) => children.push(BlockChild::Text(text)),
                        StaticText::Nothing => children.push(BlockChild::Nothing),
                        StaticText::NotStatic => {
                            children.push(BlockChild::TextHole(self.hole(child)));
                        }
                    }
                }
                _ => {
                    let child_instr = self.uses.resolve_single_use(self.func, child.identifier);
                    match child_instr {
                        Some((child_id, loads)) if self.absorbed.contains(&child_id) => {
                            self.removed.push(child_id);
                            self.removed.extend(loads);
                            children.push(BlockChild::Element(self.build(child_id)));
                        }
                        _ => {
                            if is_string_or_number(self.func, self.uses, child.identifier) {
                                children.push(BlockChild::TextHole(self.hole(child)));
                            } else {
                                self.slot_holes.push(child.clone());
                                children.push(BlockChild::Slot(self.hole(child)));
                            }
                        }
                    }
                }
            }
        }
        BlockNode {
            tag: candidate.tag.clone(),
            static_props: candidate.static_props.clone(),
            dynamic_props,
            children,
        }
    }
}

enum StaticText {
    Text(JsString),
    /// React renders nothing for null, undefined, booleans and "".
    Nothing,
    /// A value that cannot be serialized into the template.
    NotStatic,
}

fn static_text(value: &PrimitiveValue) -> StaticText {
    match value {
        PrimitiveValue::Null | PrimitiveValue::Undefined | PrimitiveValue::Boolean(_) => {
            StaticText::Nothing
        }
        PrimitiveValue::String(s) => match s.as_str() {
            Some("") => StaticText::Nothing,
            Some(_) => StaticText::Text(s.clone()),
            None => StaticText::NotStatic,
        },
        PrimitiveValue::Number(n) => match js_integer_to_string(n.value()) {
            Some(text) => StaticText::Text(JsString::from(text.as_str())),
            None => StaticText::NotStatic,
        },
    }
}

/// `String(n)` for integers whose decimal representation is the same in
/// JavaScript and Rust. Other numbers are rendered by the runtime.
fn js_integer_to_string(n: f64) -> Option<String> {
    if n.fract() != 0.0 || n.abs() >= 1e21 {
        return None;
    }
    if n == 0.0 {
        return Some("0".to_string());
    }
    Some(format!("{}", n))
}

/// Whether `id` is the result of a `.map(...)` call (through single loads).
fn is_map_call(func: &HirFunction, uses: &Uses, id: IdentifierId) -> bool {
    let mut current = id;
    loop {
        match uses.def(func, current).map(|instr| &instr.value) {
            Some(InstructionValue::LoadLocal { place, .. }) => current = place.identifier,
            Some(InstructionValue::MethodCall { property, .. }) => {
                return matches!(
                    uses.def(func, property.identifier).map(|instr| &instr.value),
                    Some(InstructionValue::PropertyLoad {
                        property: react_compiler_hir::PropertyLiteral::String(name),
                        ..
                    }) if name == "map"
                );
            }
            _ => return false,
        }
    }
}

/// Whether every value `id` can hold is a string, number or bigint, which a
/// text hole renders exactly like React DOM renders a text child.
fn is_string_or_number(func: &HirFunction, uses: &Uses, id: IdentifierId) -> bool {
    match uses.def(func, id).map(|instr| &instr.value) {
        Some(InstructionValue::TemplateLiteral { .. }) => true,
        Some(InstructionValue::BinaryExpression { operator, .. }) => matches!(
            operator,
            BinaryOperator::Add
                | BinaryOperator::Subtract
                | BinaryOperator::Multiply
                | BinaryOperator::Divide
                | BinaryOperator::Modulo
                | BinaryOperator::Exponent
                | BinaryOperator::BitwiseAnd
                | BinaryOperator::BitwiseOr
                | BinaryOperator::BitwiseXor
                | BinaryOperator::ShiftLeft
                | BinaryOperator::ShiftRight
                | BinaryOperator::UnsignedShiftRight
        ),
        Some(InstructionValue::UnaryExpression { operator, .. }) => matches!(
            operator,
            UnaryOperator::Minus
                | UnaryOperator::Plus
                | UnaryOperator::BitwiseNot
                | UnaryOperator::TypeOf
        ),
        _ => false,
    }
}

fn classify_element(func: &HirFunction, uses: &Uses, instr: &Instruction) -> Option<Candidate> {
    let InstructionValue::JsxExpression {
        tag: JsxTag::Builtin(tag),
        props,
        children,
        ..
    } = &instr.value
    else {
        return None;
    };
    if !BLOCK_TAGS.contains(&tag.name.as_str()) {
        return None;
    }
    let mut key = None;
    let mut static_props = Vec::new();
    let mut dynamic_props = Vec::new();
    for attr in props {
        let JsxAttribute::Attribute { name, place } = attr else {
            return None;
        };
        if name == "key" {
            key = Some(place.clone());
            continue;
        }
        if EXCLUDED_PROPS.contains(&name.as_str()) || name.contains(':') {
            return None;
        }
        if INPUT_ONLY_PROPS.contains(&name.as_str()) && tag.name != "input" {
            return None;
        }
        if name == "disabled" && INTERACTIVE_TAGS.contains(&tag.name.as_str()) {
            return None;
        }
        if is_event_prop(name) {
            let base = name.strip_suffix("Capture").unwrap_or(name.as_str());
            if !BLOCK_EVENTS.contains(&base) && !FORM_EVENTS.contains(&base) {
                return None;
            }
            dynamic_props.push((name.clone(), place.clone()));
            continue;
        }
        match uses.def(func, place.identifier).map(|instr| &instr.value) {
            Some(InstructionValue::Primitive { value, .. }) => match static_prop(value) {
                Some(value) => static_props.push((name.clone(), value)),
                None => dynamic_props.push((name.clone(), place.clone())),
            },
            _ => dynamic_props.push((name.clone(), place.clone())),
        }
    }
    Some(Candidate {
        tag: tag.name.clone(),
        key,
        static_props,
        dynamic_props,
        children: children.clone().unwrap_or_default(),
    })
    .filter(|candidate| candidate.tag != "input" || candidate.children.is_empty())
}

fn is_event_prop(name: &str) -> bool {
    let bytes = name.as_bytes();
    bytes.len() > 2 && bytes[0] == b'o' && bytes[1] == b'n' && bytes[2].is_ascii_uppercase()
}

fn static_prop(value: &PrimitiveValue) -> Option<BlockStaticValue> {
    match value {
        PrimitiveValue::Null => Some(BlockStaticValue::Null),
        // `undefined` is not representable in the JSON-like description.
        PrimitiveValue::Undefined => None,
        PrimitiveValue::Boolean(b) => Some(BlockStaticValue::Boolean(*b)),
        PrimitiveValue::Number(n) => {
            let n = n.value();
            n.is_finite().then_some(BlockStaticValue::Number(n))
        }
        PrimitiveValue::String(s) => Some(BlockStaticValue::String(s.clone())),
    }
}
