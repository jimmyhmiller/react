// Copyright (c) Meta Platforms, Inc. and affiliates.
//
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.

//! Static islands (`enableStaticIslands`).
//!
//! Wraps JSX subtrees that look static in `unstable_StaticIsland` (see
//! `compiler/docs/experiments/0005-static-islands.md`). The server renders an
//! island's children and only delimits them as an island if their render was
//! static; the client then leaves them dehydrated. So this pass only decides
//! where that check is worthwhile: wrapping content that needs hydration costs
//! a boundary, but never leaves it dehydrated.
//!
//! An element is wrapped when:
//! - it and every element created for it in this function (its JSX children
//!   and JSX-valued props, used only by it) is a host element whose tag and
//!   props need no hydration (no event handlers, `ref`, or hydration-sensitive
//!   props and tags, like the server's check), or an element of a static
//!   component of the module: a component that calls no hooks and whose
//!   elements all satisfy this rule. Other values it renders (props, results of
//!   calls, `.map` results) are allowed: the server checks what they render;
//! - it is at an exclusive position (like a block root: the island has a
//!   different type than the element it replaces, so no other element of the
//!   same type may reach the same position);
//! - no enclosing element in this function is wrapped (islands are maximal);
//! - its subtree is large enough: an island replaces the hydration of the
//!   subtree with the hydration of a boundary.

use rustc_hash::{FxHashMap, FxHashSet};

use react_compiler_hir::environment::Environment;
use react_compiler_hir::visitors;
use react_compiler_hir::{
    EvaluationOrder, FunctionId, HirFunction, IdentifierId, Instruction, InstructionId,
    InstructionValue, JsxAttribute, JsxTag, NonLocalBinding, Place, PlaceOrSpread, PropertyLiteral,
    ReactFunctionType,
};
use react_compiler_lowering::{create_temporary_place, mark_instruction_ids};

use crate::inline_components::function_calls_hook;
use crate::jsx_block_positions::Positions;

/// The static components of a module, with the weight of what each renders
/// (see MIN_ISLAND_WEIGHT).
pub type StaticComponents = FxHashMap<String, usize>;

/// The runtime element type, imported from react/compiler-runtime.
pub trait StaticIslandImports {
    fn static_island(&mut self) -> NonLocalBinding;
}

/// Host elements whose hydration attaches listeners or state, or that are
/// hoisted or singletons (the server treats them as interactive).
const HYDRATION_SENSITIVE_TAGS: &[&str] = &[
    "input", "select", "textarea", "option", "form", "img", "image", "video", "audio", "source",
    "iframe", "object", "embed", "link", "script", "style", "title", "meta", "base", "details",
    "dialog", "html", "head", "body",
];

/// Props whose hydration has effects (the server treats them as interactive).
const HYDRATION_SENSITIVE_PROPS: &[&str] =
    &["ref", "autoFocus", "popover", "popoverTarget", "formAction"];

/// The minimum weight of a subtree to wrap: host elements and rendered values of
/// unknown content count 1, lists of static items 3, and elements of static
/// components the weight of what they render.
const MIN_ISLAND_WEIGHT: usize = 3;

fn is_event_prop(name: &str) -> bool {
    let bytes = name.as_bytes();
    bytes.len() > 2 && bytes[0] == b'o' && bytes[1] == b'n' && bytes[2].is_ascii_uppercase()
}

/// Whether a component of the module is static: it calls no hooks and every
/// element it creates is an allowed host element or an element of a static
/// component (`static_components`, which may include itself).
pub fn is_static_component(
    func: &HirFunction,
    env: &Environment,
    static_components: &StaticComponents,
) -> bool {
    if func.is_async || func.generator || function_calls_hook(func, env) {
        return false;
    }
    elements_are_allowed(func, env, static_components)
}

fn elements_are_allowed(
    func: &HirFunction,
    env: &Environment,
    static_components: &StaticComponents,
) -> bool {
    let globals = global_names(func);
    for instr in &func.instructions {
        match &instr.value {
            InstructionValue::JsxExpression { tag, props, .. } => {
                if !element_is_allowed(tag, props, &globals, static_components) {
                    return false;
                }
            }
            InstructionValue::FunctionExpression { lowered_func, .. }
            | InstructionValue::ObjectMethod { lowered_func, .. } => {
                if !elements_are_allowed(
                    &env.functions[lowered_func.func.0 as usize],
                    env,
                    static_components,
                ) {
                    return false;
                }
            }
            _ => {}
        }
    }
    true
}

/// The weight of what a static component renders, given the weights of the
/// static components (see MIN_ISLAND_WEIGHT): the weight of every element it
/// creates, with elements created by `.map` callbacks counting as lists.
pub fn static_component_weight(
    func: &HirFunction,
    env: &Environment,
    static_components: &StaticComponents,
) -> usize {
    let globals = global_names(func);
    let mut total = 0;
    for instr in &func.instructions {
        match &instr.value {
            InstructionValue::JsxExpression { tag, .. } => {
                total += match tag {
                    JsxTag::Builtin(_) => 1,
                    JsxTag::Place(place) => globals
                        .get(&place.identifier)
                        .and_then(|name| static_components.get(name))
                        .copied()
                        .unwrap_or(1),
                };
            }
            InstructionValue::FunctionExpression { lowered_func, .. }
            | InstructionValue::ObjectMethod { lowered_func, .. } => {
                let inner = static_component_weight(
                    &env.functions[lowered_func.func.0 as usize],
                    env,
                    static_components,
                );
                if inner > 0 {
                    total += inner.max(3);
                }
            }
            _ => {}
        }
    }
    total.min(MAX_COMPONENT_WEIGHT)
}

/// Bounds the weights of (possibly recursive) static components.
const MAX_COMPONENT_WEIGHT: usize = 1000;

/// The names of the module bindings loaded by each `LoadGlobal` lvalue.
fn global_names(func: &HirFunction) -> FxHashMap<IdentifierId, String> {
    let mut names = FxHashMap::default();
    for instr in &func.instructions {
        if let InstructionValue::LoadGlobal {
            binding: NonLocalBinding::ModuleLocal { name },
            ..
        } = &instr.value
        {
            names.insert(instr.lvalue.identifier, name.clone());
        }
    }
    names
}

/// Whether an element's own tag and props need no hydration.
fn element_is_allowed(
    tag: &JsxTag,
    props: &[JsxAttribute],
    globals: &FxHashMap<IdentifierId, String>,
    static_components: &StaticComponents,
) -> bool {
    match tag {
        JsxTag::Builtin(builtin) => {
            if builtin.name.contains('-')
                || HYDRATION_SENSITIVE_TAGS.contains(&builtin.name.as_str())
            {
                return false;
            }
        }
        JsxTag::Place(place) => match globals.get(&place.identifier) {
            Some(name) if static_components.contains_key(name) => {}
            _ => return false,
        },
    }
    props.iter().all(|prop| match prop {
        JsxAttribute::Attribute { name, .. } => {
            !is_event_prop(name) && !HYDRATION_SENSITIVE_PROPS.contains(&name.as_str())
        }
        JsxAttribute::SpreadAttribute { .. } => false,
    })
}

/// Wraps the static subtrees of a component or hook and of the functions it
/// creates. Returns the number of islands.
pub fn wrap_static_islands(
    func: &mut HirFunction,
    env: &mut Environment,
    static_components: &StaticComponents,
    imports: &mut dyn StaticIslandImports,
) -> usize {
    if !matches!(
        func.fn_type,
        ReactFunctionType::Component | ReactFunctionType::Hook
    ) {
        return 0;
    }
    // The elements of a static component are wrapped where it is rendered:
    // an island inside it would be nested in its callers' islands.
    if func
        .id
        .as_ref()
        .is_some_and(|name| static_components.contains_key(name))
    {
        return 0;
    }
    let returns_rendered = func.fn_type == ReactFunctionType::Component;
    let rendered_list_callbacks =
        Positions::build(func, env, returns_rendered).rendered_list_callbacks();
    let (mut count, enclosed_callbacks) =
        wrap_in_function(func, env, static_components, imports, returns_rendered);
    count += wrap_in_nested_functions(
        func,
        env,
        static_components,
        imports,
        &rendered_list_callbacks,
        &enclosed_callbacks,
    );
    count
}

fn wrap_in_nested_functions(
    func: &mut HirFunction,
    env: &mut Environment,
    static_components: &StaticComponents,
    imports: &mut dyn StaticIslandImports,
    rendered_list_callbacks: &FxHashSet<FunctionId>,
    enclosed_callbacks: &FxHashSet<FunctionId>,
) -> usize {
    let nested: Vec<FunctionId> = func
        .instructions
        .iter()
        .filter_map(|instr| match &instr.value {
            InstructionValue::FunctionExpression { lowered_func, .. }
            | InstructionValue::ObjectMethod { lowered_func, .. } => Some(lowered_func.func),
            _ => None,
        })
        .collect();
    let mut count = 0;
    for func_id in nested {
        // The items of a list in an island are in the island.
        if enclosed_callbacks.contains(&func_id) {
            continue;
        }
        let mut inner = std::mem::replace(
            &mut env.functions[func_id.0 as usize],
            react_compiler_ssa::enter_ssa::placeholder_function(),
        );
        let inner_returns_rendered = rendered_list_callbacks.contains(&func_id);
        let inner_list_callbacks =
            Positions::build(&inner, env, inner_returns_rendered).rendered_list_callbacks();
        let (inner_count, inner_enclosed_callbacks) = wrap_in_function(
            &mut inner,
            env,
            static_components,
            imports,
            inner_returns_rendered,
        );
        count += inner_count;
        count += wrap_in_nested_functions(
            &mut inner,
            env,
            static_components,
            imports,
            &inner_list_callbacks,
            &inner_enclosed_callbacks,
        );
        env.functions[func_id.0 as usize] = inner;
    }
    count
}

struct Analysis {
    /// Uses of each identifier as an operand.
    use_counts: FxHashMap<IdentifierId, usize>,
    /// The instruction defining each lvalue.
    defs: FxHashMap<IdentifierId, InstructionId>,
    /// For allowed elements: the weight of their subtree, or None if the
    /// subtree contains an element that is not allowed.
    weights: FxHashMap<InstructionId, Option<usize>>,
}

fn wrap_in_function(
    func: &mut HirFunction,
    env: &mut Environment,
    static_components: &StaticComponents,
    imports: &mut dyn StaticIslandImports,
    returns_rendered: bool,
) -> (usize, FxHashSet<FunctionId>) {
    let globals = global_names(func);
    let mut analysis = Analysis {
        use_counts: FxHashMap::default(),
        defs: FxHashMap::default(),
        weights: FxHashMap::default(),
    };
    for block in func.body.blocks.values() {
        for phi in &block.phis {
            for operand in phi.operands.values() {
                *analysis.use_counts.entry(operand.identifier).or_default() += 1;
            }
        }
        for instr_id in &block.instructions {
            let instr = &func.instructions[instr_id.0 as usize];
            analysis.defs.insert(instr.lvalue.identifier, *instr_id);
            for place in visitors::each_instruction_value_operand(&instr.value, env) {
                *analysis.use_counts.entry(place.identifier).or_default() += 1;
            }
        }
        for place in visitors::each_terminal_operand(&block.terminal) {
            *analysis.use_counts.entry(place.identifier).or_default() += 1;
        }
    }

    let element_ids: Vec<InstructionId> = func
        .body
        .blocks
        .values()
        .flat_map(|block| block.instructions.iter().copied())
        .filter(|id| {
            matches!(
                func.instructions[id.0 as usize].value,
                InstructionValue::JsxExpression { .. }
            )
        })
        .collect();
    // The elements created only for an operand of another element, and the
    // callbacks of the lists rendered by an element.
    let mut child_elements: FxHashMap<InstructionId, Vec<InstructionId>> = FxHashMap::default();
    let mut child_lists: FxHashMap<InstructionId, Vec<FunctionId>> = FxHashMap::default();
    let mut has_parent: FxHashSet<InstructionId> = FxHashSet::default();
    for id in &element_ids {
        let InstructionValue::JsxExpression {
            props, children, ..
        } = &func.instructions[id.0 as usize].value
        else {
            continue;
        };
        let operands = props
            .iter()
            .filter_map(|prop| match prop {
                JsxAttribute::Attribute { place, .. } => Some(place),
                JsxAttribute::SpreadAttribute { .. } => None,
            })
            .chain(children.iter().flatten());
        for place in operands {
            match element_operand(func, &analysis, place) {
                Operand::Element(child) => {
                    child_elements.entry(*id).or_default().push(child);
                    has_parent.insert(child);
                }
                Operand::List(callback) => {
                    child_lists.entry(*id).or_default().push(callback);
                }
                _ => {}
            }
        }
    }
    for id in &element_ids {
        weight(func, env, &globals, static_components, &mut analysis, *id);
    }

    // Top-down, so that islands are maximal: an element is wrapped if no
    // enclosing element is.
    let positions = Positions::build(func, env, returns_rendered);
    let mut roots: Vec<InstructionId> = Vec::new();
    let mut enclosed_callbacks: FxHashSet<FunctionId> = FxHashSet::default();
    let mut stack: Vec<(InstructionId, bool)> = element_ids
        .iter()
        .filter(|id| !has_parent.contains(id))
        .map(|id| (*id, false))
        .collect();
    while let Some((id, enclosed)) = stack.pop() {
        let wrapped = !enclosed
            && analysis
                .weights
                .get(&id)
                .is_some_and(|weight| weight.is_some_and(|w| w >= MIN_ISLAND_WEIGHT))
            && is_exclusive(func, &globals, &positions, id);
        if wrapped {
            roots.push(id);
        }
        if enclosed || wrapped {
            enclosed_callbacks.extend(child_lists.get(&id).into_iter().flatten().copied());
        }
        for child in child_elements.get(&id).into_iter().flatten() {
            stack.push((*child, enclosed || wrapped));
        }
    }
    if roots.is_empty() {
        return (0, enclosed_callbacks);
    }

    let binding = imports.static_island();
    let mut insertions: FxHashMap<InstructionId, Vec<InstructionId>> = FxHashMap::default();
    for root in &roots {
        let (original, key, loc) = {
            let instr = &func.instructions[root.0 as usize];
            let InstructionValue::JsxExpression { props, loc, .. } = &instr.value else {
                unreachable!("WrapStaticIslands: an island root is a JSX element");
            };
            let key = props.iter().find_map(|prop| match prop {
                JsxAttribute::Attribute { name, place } if name == "key" => Some(place.clone()),
                _ => None,
            });
            (instr.lvalue.clone(), key, loc.clone())
        };
        // The element writes a new temporary, and the island takes over the
        // element's lvalue, so every use of the element now uses the island.
        let element_place = create_temporary_place(env, loc.clone());
        func.instructions[root.0 as usize].lvalue = element_place.clone();

        let tag_place = create_temporary_place(env, loc.clone());
        env.add_static_island_tag(tag_place.identifier);
        let mut props = Vec::new();
        if let Some(place) = key {
            props.push(JsxAttribute::Attribute {
                name: "key".to_string(),
                place,
            });
        }
        let added = vec![
            push_instruction(
                func,
                tag_place.clone(),
                InstructionValue::LoadGlobal {
                    binding: binding.clone(),
                    loc: loc.clone(),
                },
            ),
            push_instruction(
                func,
                original,
                InstructionValue::JsxExpression {
                    tag: JsxTag::Place(tag_place),
                    props,
                    children: Some(vec![element_place]),
                    loc: loc.clone(),
                    opening_loc: loc,
                    closing_loc: None,
                },
            ),
        ];
        insertions.insert(*root, added);
    }
    for block in func.body.blocks.values_mut() {
        if !block
            .instructions
            .iter()
            .any(|id| insertions.contains_key(id))
        {
            continue;
        }
        let mut instructions = Vec::with_capacity(block.instructions.len() + 2 * insertions.len());
        for id in &block.instructions {
            instructions.push(*id);
            if let Some(added) = insertions.get(id) {
                instructions.extend(added.iter().copied());
            }
        }
        block.instructions = instructions;
    }
    mark_instruction_ids(&mut func.body, &mut func.instructions);
    (roots.len(), enclosed_callbacks)
}

/// Computes the weight of an element's subtree (see MIN_ISLAND_WEIGHT), or None
/// if it contains an element that is not allowed.
fn weight(
    func: &HirFunction,
    env: &Environment,
    globals: &FxHashMap<IdentifierId, String>,
    static_components: &StaticComponents,
    analysis: &mut Analysis,
    id: InstructionId,
) -> Option<usize> {
    if let Some(weight) = analysis.weights.get(&id) {
        return *weight;
    }
    // Guards against cycles (which SSA form does not produce).
    analysis.weights.insert(id, None);
    let result = (|| {
        let instr = &func.instructions[id.0 as usize];
        let InstructionValue::JsxExpression {
            tag,
            props,
            children,
            ..
        } = &instr.value
        else {
            return None;
        };
        if !element_is_allowed(tag, props, globals, static_components) {
            return None;
        }
        let mut total = match tag {
            JsxTag::Builtin(_) => 1,
            JsxTag::Place(place) => globals
                .get(&place.identifier)
                .and_then(|name| static_components.get(name))
                .copied()
                .unwrap_or(1),
        };
        // Attributes are only content if they are elements (like a component's
        // `header={<h2 />}`); children are always content.
        let attributes = props.iter().filter_map(|prop| match prop {
            JsxAttribute::Attribute { name, place } if name != "key" => Some(place),
            _ => None,
        });
        for place in attributes {
            match element_operand(func, analysis, place) {
                Operand::Element(child) => {
                    total += weight(func, env, globals, static_components, analysis, child)?;
                }
                Operand::List(callback) => {
                    total += list_weight(env, static_components, callback)?;
                }
                Operand::NotStatic => return None,
                Operand::Primitive | Operand::Unknown => {}
            }
        }
        for place in children.iter().flatten() {
            match element_operand(func, analysis, place) {
                Operand::Element(child) => {
                    total += weight(func, env, globals, static_components, analysis, child)?;
                }
                Operand::List(callback) => {
                    total += list_weight(env, static_components, callback)?;
                }
                Operand::Primitive => {}
                Operand::Unknown => total += 1,
                Operand::NotStatic => return None,
            }
        }
        Some(total)
    })();
    analysis.weights.insert(id, result);
    result
}

enum Operand {
    /// An element created only for this operand.
    Element(InstructionId),
    /// A value that renders as text or nothing.
    Primitive,
    /// The result of a `.map` call with a callback of this function.
    List(FunctionId),
    /// A value whose content is checked by the server.
    Unknown,
    /// An element that is also used elsewhere: it may be rendered at another
    /// position, where wrapping it would change its type.
    NotStatic,
}

fn element_operand(func: &HirFunction, analysis: &Analysis, place: &Place) -> Operand {
    let Some(def) = analysis.defs.get(&place.identifier) else {
        return Operand::Unknown;
    };
    match &func.instructions[def.0 as usize].value {
        InstructionValue::JsxExpression { .. } => {
            if analysis.use_counts.get(&place.identifier).copied() == Some(1) {
                Operand::Element(*def)
            } else {
                Operand::NotStatic
            }
        }
        InstructionValue::Primitive { .. }
        | InstructionValue::JSXText { .. }
        | InstructionValue::TemplateLiteral { .. } => Operand::Primitive,
        InstructionValue::MethodCall { property, args, .. } => {
            let is_map = analysis.defs.get(&property.identifier).is_some_and(|def| {
                matches!(
                    &func.instructions[def.0 as usize].value,
                    InstructionValue::PropertyLoad {
                        property: PropertyLiteral::String(name),
                        ..
                    } if name == "map"
                )
            });
            let callback = match args.first() {
                Some(PlaceOrSpread::Place(callback)) if is_map => analysis
                    .defs
                    .get(&callback.identifier)
                    .and_then(|def| match &func.instructions[def.0 as usize].value {
                        InstructionValue::FunctionExpression { lowered_func, .. } => {
                            Some(lowered_func.func)
                        }
                        _ => None,
                    }),
                _ => None,
            };
            match callback {
                Some(callback) => Operand::List(callback),
                None => Operand::Unknown,
            }
        }
        _ => Operand::Unknown,
    }
}

/// The weight of a list whose items are created by `callback`, or None if the
/// callback creates an element that is not allowed.
fn list_weight(
    env: &Environment,
    static_components: &StaticComponents,
    callback: FunctionId,
) -> Option<usize> {
    let callback = &env.functions[callback.0 as usize];
    if function_calls_hook(callback, env) || !elements_are_allowed(callback, env, static_components)
    {
        return None;
    }
    Some(3)
}

/// Whether the island may replace the element: no element of the same type can
/// be rendered at its positions.
fn is_exclusive(
    func: &HirFunction,
    globals: &FxHashMap<IdentifierId, String>,
    positions: &Positions<'_>,
    id: InstructionId,
) -> bool {
    let instr = &func.instructions[id.0 as usize];
    match &instr.value {
        InstructionValue::JsxExpression {
            tag: JsxTag::Builtin(builtin),
            ..
        } => positions.is_exclusive(instr.lvalue.identifier, &builtin.name),
        InstructionValue::JsxExpression {
            tag: JsxTag::Place(place),
            ..
        } => globals
            .get(&place.identifier)
            .is_some_and(|name| positions.is_exclusive_component(instr.lvalue.identifier, name)),
        _ => false,
    }
}

fn push_instruction(
    func: &mut HirFunction,
    lvalue: Place,
    value: InstructionValue,
) -> InstructionId {
    let id = InstructionId(func.instructions.len() as u32);
    func.instructions.push(Instruction {
        id: EvaluationOrder(0),
        loc: None,
        lvalue,
        value,
        effects: None,
    });
    id
}
