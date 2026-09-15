// Copyright (c) Meta Platforms, Inc. and affiliates.
//
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.

//! Where a block element may be rendered.
//!
//! Compiling a host element into a block changes the element's type from its
//! tag (`'li'`) to a template. React keeps the host instance of an element when
//! the element at the same position (and key) has the same type, so replacing
//! `<li>` with a block is only unobservable at positions where no other element
//! with the same tag can be rendered, now or in another render. Otherwise React
//! would reuse the `<li>` DOM node for the other element, while a block and a
//! host `<li>` (or two different blocks) are remounted.
//!
//! A value is at an *exclusive position* for a tag if every use of it ends in
//! one of:
//! - a child of a host element or of a fragment (a fixed child position),
//! - the return value of a function whose returns are rendered: a component,
//!   or a `.map` callback whose result is only rendered as such a child or
//!   returned by a component,
//!
//! and every other value that can reach the same position (through local
//! variables, conditionals or other returns) is a primitive, a fragment, a
//! component element or a host element with a different tag.

use rustc_hash::{FxHashMap, FxHashSet};

use react_compiler_hir::environment::Environment;
use react_compiler_hir::visitors;
use react_compiler_hir::{
    BlockId, FunctionId, HirFunction, IdentifierId, InstructionId, InstructionValue, JsxTag,
    NonLocalBinding, PlaceOrSpread, PropertyLiteral, Terminal,
};

#[derive(Debug, Clone, Copy)]
enum Use {
    Instruction(InstructionId),
    Terminal(BlockId),
    /// An operand of the phi that defines the identifier.
    Phi(IdentifierId),
}

pub(crate) struct Positions<'f> {
    func: &'f HirFunction,
    /// The tags of static island elements (whose child is at a fixed
    /// position).
    island_tags: FxHashSet<IdentifierId>,
    uses: FxHashMap<IdentifierId, Vec<Use>>,
    /// The instruction whose lvalue is the identifier.
    defs: FxHashMap<IdentifierId, InstructionId>,
    /// The value stored into each `StoreLocal` target.
    stores: FxHashMap<IdentifierId, IdentifierId>,
    /// The operands of each phi, by the phi's identifier.
    phis: FxHashMap<IdentifierId, Vec<IdentifierId>>,
    /// Whether the function's return value is rendered at a fixed position.
    returns_rendered: bool,
}

impl<'f> Positions<'f> {
    pub(crate) fn build(func: &'f HirFunction, env: &Environment, returns_rendered: bool) -> Self {
        let mut positions = Positions {
            func,
            island_tags: FxHashSet::default(),
            uses: FxHashMap::default(),
            defs: FxHashMap::default(),
            stores: FxHashMap::default(),
            phis: FxHashMap::default(),
            returns_rendered,
        };
        for block in func.body.blocks.values() {
            for phi in &block.phis {
                let operands: Vec<IdentifierId> =
                    phi.operands.values().map(|place| place.identifier).collect();
                for operand in &operands {
                    positions
                        .uses
                        .entry(*operand)
                        .or_default()
                        .push(Use::Phi(phi.place.identifier));
                }
                positions.phis.insert(phi.place.identifier, operands);
            }
            for instr_id in &block.instructions {
                let instr = &func.instructions[instr_id.0 as usize];
                positions.defs.insert(instr.lvalue.identifier, *instr_id);
                if env.is_static_island_tag(instr.lvalue.identifier) {
                    positions.island_tags.insert(instr.lvalue.identifier);
                }
                if let InstructionValue::StoreLocal { lvalue, value, .. } = &instr.value {
                    positions
                        .stores
                        .insert(lvalue.place.identifier, value.identifier);
                }
                for place in visitors::each_instruction_value_operand(&instr.value, env) {
                    positions
                        .uses
                        .entry(place.identifier)
                        .or_default()
                        .push(Use::Instruction(*instr_id));
                }
            }
            for place in visitors::each_terminal_operand(&block.terminal) {
                positions
                    .uses
                    .entry(place.identifier)
                    .or_default()
                    .push(Use::Terminal(block.id));
            }
        }
        positions
    }

    /// Whether the element produced as `root` is only rendered at positions
    /// where no other element with root tag `tag` can be rendered.
    pub(crate) fn is_exclusive(&self, root: IdentifierId, tag: &str) -> bool {
        let alternatives = |id: IdentifierId| {
            self.leaves_are(id, root, &mut FxHashSet::default(), &|value| {
                is_distinct_element(value, tag)
            })
        };
        self.flows_to_positions(root, &mut FxHashSet::default(), &alternatives)
    }

    /// Whether the element of component `name` (a module binding) produced as
    /// `root` is only rendered at positions where no other element of the same
    /// component can be rendered.
    pub(crate) fn is_exclusive_component(&self, root: IdentifierId, name: &str) -> bool {
        let alternatives = |id: IdentifierId| {
            self.leaves_are(id, root, &mut FxHashSet::default(), &|value| {
                self.is_distinct_from_component(value, name)
            })
        };
        self.flows_to_positions(root, &mut FxHashSet::default(), &alternatives)
    }

    fn is_distinct_from_component(&self, value: &InstructionValue, name: &str) -> bool {
        match value {
            InstructionValue::JsxExpression {
                tag: JsxTag::Place(place),
                ..
            } => match self.defs.get(&place.identifier).map(|def| {
                &self.func.instructions[def.0 as usize].value
            }) {
                // A component of the module or an island: a different type
                // unless it is the same binding.
                Some(InstructionValue::LoadGlobal {
                    binding: NonLocalBinding::ModuleLocal { name: other },
                    ..
                }) => other != name,
                _ => self.island_tags.contains(&place.identifier),
            },
            InstructionValue::JsxExpression { .. } | InstructionValue::JsxFragment { .. } => true,
            other => is_primitive(other),
        }
    }

    /// Whether the array produced as `root` by a `.map` call is only rendered
    /// as a fixed child or returned as a rendered value, with no other array
    /// (whose items could share keys) reaching the same position.
    fn is_exclusive_list(&self, root: IdentifierId) -> bool {
        let alternatives = |id: IdentifierId| {
            self.leaves_are(id, root, &mut FxHashSet::default(), &|value| is_primitive(value))
        };
        self.flows_to_positions(root, &mut FxHashSet::default(), &alternatives)
    }

    /// Follows the uses of `id` to rendered positions. `alternatives_ok`
    /// decides whether every value that can reach a position (identified by a
    /// value that flows there) is acceptable.
    fn flows_to_positions(
        &self,
        id: IdentifierId,
        visiting: &mut FxHashSet<IdentifierId>,
        alternatives_ok: &dyn Fn(IdentifierId) -> bool,
    ) -> bool {
        if !visiting.insert(id) {
            return true;
        }
        let Some(uses) = self.uses.get(&id) else {
            // A value that is not used is not rendered.
            return true;
        };
        uses.iter().all(|use_| match *use_ {
            Use::Terminal(block_id) => match &self.func.body.blocks[&block_id].terminal {
                Terminal::Return { value, .. } if value.identifier == id => {
                    // Every returned value reaches the same position.
                    self.returns_rendered
                        && self.func.body.blocks.values().all(|block| match &block.terminal {
                            Terminal::Return { value, .. } => alternatives_ok(value.identifier),
                            _ => true,
                        })
                }
                _ => false,
            },
            Use::Phi(phi) => {
                alternatives_ok(phi) && self.flows_to_positions(phi, visiting, alternatives_ok)
            }
            Use::Instruction(instr_id) => {
                let instr = &self.func.instructions[instr_id.0 as usize];
                match &instr.value {
                    InstructionValue::JsxExpression {
                        tag: JsxTag::Builtin(_),
                        props,
                        ..
                    } => {
                        let in_props = props.iter().any(|attr| match attr {
                            react_compiler_hir::JsxAttribute::Attribute { place, .. } => {
                                place.identifier == id
                            }
                            react_compiler_hir::JsxAttribute::SpreadAttribute { argument } => {
                                argument.identifier == id
                            }
                        });
                        !in_props
                    }
                    InstructionValue::JsxFragment { .. } => true,
                    InstructionValue::JsxExpression {
                        tag: JsxTag::Place(tag),
                        children: Some(children),
                        ..
                    } if self.island_tags.contains(&tag.identifier) => {
                        // An island's only child.
                        children.len() == 1 && children[0].identifier == id
                    }
                    InstructionValue::LoadLocal { place, .. } if place.identifier == id => {
                        self.flows_to_positions(instr.lvalue.identifier, visiting, alternatives_ok)
                    }
                    InstructionValue::StoreLocal { lvalue, value, .. } if value.identifier == id => {
                        self.flows_to_positions(lvalue.place.identifier, visiting, alternatives_ok)
                    }
                    _ => false,
                }
            }
        })
    }

    /// Whether every value `id` can hold is `root` or satisfies `accept`,
    /// following loads, stores and phis.
    fn leaves_are(
        &self,
        id: IdentifierId,
        root: IdentifierId,
        visiting: &mut FxHashSet<IdentifierId>,
        accept: &dyn Fn(&InstructionValue) -> bool,
    ) -> bool {
        if id == root || !visiting.insert(id) {
            return true;
        }
        if let Some(operands) = self.phis.get(&id) {
            return operands
                .iter()
                .all(|operand| self.leaves_are(*operand, root, visiting, accept));
        }
        if let Some(stored) = self.stores.get(&id) {
            return self.leaves_are(*stored, root, visiting, accept);
        }
        let Some(def) = self.defs.get(&id) else {
            // Parameters and captured values can hold anything.
            return false;
        };
        match &self.func.instructions[def.0 as usize].value {
            InstructionValue::LoadLocal { place, .. } => {
                self.leaves_are(place.identifier, root, visiting, accept)
            }
            value => accept(value),
        }
    }

    /// The nested functions of this function that are `.map` callbacks whose
    /// returned values are rendered as the items of a list at an exclusive
    /// position.
    pub(crate) fn rendered_list_callbacks(&self) -> FxHashSet<FunctionId> {
        let mut callbacks = FxHashSet::default();
        for block in self.func.body.blocks.values() {
            for instr_id in &block.instructions {
                let instr = &self.func.instructions[instr_id.0 as usize];
                let InstructionValue::MethodCall { property, args, .. } = &instr.value else {
                    continue;
                };
                let is_map = self.defs.get(&property.identifier).is_some_and(|def| {
                    matches!(
                        &self.func.instructions[def.0 as usize].value,
                        InstructionValue::PropertyLoad {
                            property: PropertyLiteral::String(name),
                            ..
                        } if name == "map"
                    )
                });
                let [PlaceOrSpread::Place(callback)] = args.as_slice() else {
                    continue;
                };
                if !is_map
                    || self.uses.get(&callback.identifier).map(|u| u.len()) != Some(1)
                    || !self.is_exclusive_list(instr.lvalue.identifier)
                {
                    continue;
                }
                if let Some(def) = self.defs.get(&callback.identifier) {
                    if let InstructionValue::FunctionExpression { lowered_func, .. } =
                        &self.func.instructions[def.0 as usize].value
                    {
                        callbacks.insert(lowered_func.func);
                    }
                }
            }
        }
        callbacks
    }
}

/// Whether a value is not an element that React could render in place of an
/// element with root tag `tag` while keeping its host instance.
fn is_distinct_element(value: &InstructionValue, tag: &str) -> bool {
    match value {
        InstructionValue::JsxExpression {
            tag: JsxTag::Builtin(other),
            ..
        } => other.name != tag,
        // A component element or a fragment has a different type.
        InstructionValue::JsxExpression { .. } | InstructionValue::JsxFragment { .. } => true,
        other => is_primitive(other),
    }
}

fn is_primitive(value: &InstructionValue) -> bool {
    matches!(
        value,
        InstructionValue::Primitive { .. }
            | InstructionValue::JSXText { .. }
            | InstructionValue::TemplateLiteral { .. }
            | InstructionValue::BinaryExpression { .. }
            | InstructionValue::UnaryExpression { .. }
    )
}
