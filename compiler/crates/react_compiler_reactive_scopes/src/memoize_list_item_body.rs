// Copyright (c) Meta Platforms, Inc. and affiliates.
//
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.

//! Builds the per-item memo scope of a list item callback selected by
//! `MemoizeListItems` (react_compiler_optimization), right before the
//! callback's code is generated.
//!
//! The callback returns a block element. Its allocations are the element and
//! the values that exist only to build it: the values array, event handler
//! closures, object and array literals, the template reference and constants,
//! including `const` variables that hold such a value and are read only by
//! another allocation.
//! They are pure: evaluating them again with the same inputs produces
//! equivalent values. This transform moves them, in their original order, into
//! a reactive scope placed right before the `return`. The scope's
//! dependencies are every other value they read (derived values, parameters,
//! captured variables and the variables captured by the closures); its
//! declaration is the returned element.
//!
//! Moving the allocations after the callback's remaining instructions does not
//! change what they read: no statement after the first allocation reassigns a
//! variable (otherwise the callback is not memoized), and the instructions the
//! allocations read were evaluated before them already. The values the
//! allocations produce are used only by other allocations.
//!
//! Codegen then emits the scope like any other reactive scope, using the
//! callback's cache from `listItemCache.next(N)`.

use rustc_hash::{FxHashMap, FxHashSet};

use react_compiler_diagnostics::CompilerError;
use react_compiler_hir::environment::Environment;
use react_compiler_hir::{
    EvaluationOrder, IdentifierId, IdentifierName, InstructionValue, Place, ReactiveBlock,
    ReactiveFunction, ReactiveScopeBlock, ReactiveScopeDeclaration, ReactiveScopeDependency,
    ReactiveStatement, ReactiveTerminal, ReactiveValue,
};

use crate::visitors::{self, ReactiveFunctionVisitor};

struct UseCounter<'a> {
    env: &'a Environment,
}

impl ReactiveFunctionVisitor for UseCounter<'_> {
    type State = FxHashMap<IdentifierId, usize>;

    fn env(&self) -> &Environment {
        self.env
    }

    fn visit_place(&self, _id: EvaluationOrder, place: &Place, state: &mut Self::State) {
        *state.entry(place.identifier).or_default() += 1;
    }
}

/// Whether evaluating the instruction value again with the same operands
/// produces an equivalent value and has no other effect. Reading a local is
/// included: the callback reassigns no variables.
fn is_pure_allocation(value: &InstructionValue) -> bool {
    matches!(
        value,
        InstructionValue::JsxExpression { .. }
            | InstructionValue::LoadLocal { .. }
            | InstructionValue::ArrayExpression { .. }
            | InstructionValue::ObjectExpression { .. }
            | InstructionValue::FunctionExpression { .. }
            | InstructionValue::LoadGlobal { .. }
            | InstructionValue::Primitive { .. }
            | InstructionValue::JSXText { .. }
    )
}

/// Whether a statement (or a statement nested in it) reassigns a variable.
fn statement_reassigns(statement: &ReactiveStatement) -> bool {
    match statement {
        ReactiveStatement::Instruction(instr) => value_reassigns(&instr.value),
        ReactiveStatement::Scope(scope) => scope.instructions.iter().any(statement_reassigns),
        ReactiveStatement::PrunedScope(scope) => scope.instructions.iter().any(statement_reassigns),
        ReactiveStatement::Terminal(terminal) => terminal_reassigns(&terminal.terminal),
    }
}

fn value_reassigns(value: &ReactiveValue) -> bool {
    match value {
        ReactiveValue::Instruction(value) => match value {
            InstructionValue::StoreLocal { lvalue, .. }
            | InstructionValue::DeclareLocal { lvalue, .. }
            | InstructionValue::StoreContext { lvalue, .. }
            | InstructionValue::DeclareContext { lvalue, .. } => {
                lvalue.kind == react_compiler_hir::InstructionKind::Reassign
            }
            InstructionValue::Destructure { lvalue, .. } => {
                lvalue.kind == react_compiler_hir::InstructionKind::Reassign
            }
            InstructionValue::PrefixUpdate { .. } | InstructionValue::PostfixUpdate { .. } => true,
            _ => false,
        },
        ReactiveValue::LogicalExpression { left, right, .. } => {
            value_reassigns(left) || value_reassigns(right)
        }
        ReactiveValue::ConditionalExpression {
            test,
            consequent,
            alternate,
            ..
        } => value_reassigns(test) || value_reassigns(consequent) || value_reassigns(alternate),
        ReactiveValue::SequenceExpression {
            instructions,
            value,
            ..
        } => {
            instructions.iter().any(|instr| value_reassigns(&instr.value)) || value_reassigns(value)
        }
        ReactiveValue::OptionalExpression { value, .. } => value_reassigns(value),
    }
}

fn terminal_reassigns(terminal: &ReactiveTerminal) -> bool {
    let block = |b: &ReactiveBlock| b.iter().any(statement_reassigns);
    match terminal {
        ReactiveTerminal::Break { .. }
        | ReactiveTerminal::Continue { .. }
        | ReactiveTerminal::Return { .. }
        | ReactiveTerminal::Throw { .. } => false,
        ReactiveTerminal::Switch { cases, .. } => cases
            .iter()
            .any(|case| case.block.as_ref().is_some_and(|b| block(b))),
        ReactiveTerminal::DoWhile { loop_block, test, .. }
        | ReactiveTerminal::While { test, loop_block, .. } => {
            block(loop_block) || value_reassigns(test)
        }
        ReactiveTerminal::For {
            init,
            test,
            update,
            loop_block,
            ..
        } => {
            value_reassigns(init)
                || value_reassigns(test)
                || update.as_ref().is_some_and(value_reassigns)
                || block(loop_block)
        }
        ReactiveTerminal::ForOf { init, test, loop_block, .. } => {
            value_reassigns(init) || value_reassigns(test) || block(loop_block)
        }
        ReactiveTerminal::ForIn { init, loop_block, .. } => value_reassigns(init) || block(loop_block),
        ReactiveTerminal::If {
            consequent,
            alternate,
            ..
        } => block(consequent) || alternate.as_ref().is_some_and(|b| block(b)),
        ReactiveTerminal::Label { block: b, .. } => block(b),
        ReactiveTerminal::Try { block: b, handler, .. } => block(b) || block(handler),
    }
}

/// The memo scope built for a list item callback.
pub struct ListItemScope {
    /// The scope's output: the returned element.
    pub output: IdentifierId,
    /// The element's key, when it is computed before the scope (it is passed
    /// to `listItemCache.next` so that moved items keep their caches).
    pub key: Option<IdentifierId>,
}

/// Wraps the allocations of the returned element in a memo scope. Returns the
/// scope, or `None` if the callback does not have the expected shape (in which
/// case it is left unchanged and not memoized).
///
/// `name_for` returns a fresh variable name for a promoted temporary.
pub fn memoize_list_item_body(
    func: &mut ReactiveFunction,
    env: &mut Environment,
    name_for: &mut dyn FnMut(&str) -> String,
) -> Result<Option<ListItemScope>, CompilerError> {
    let body: &ReactiveBlock = &func.body;
    let Some(ReactiveStatement::Terminal(last)) = body.last() else {
        return Ok(None);
    };
    let ReactiveTerminal::Return { value: returned, .. } = &last.terminal else {
        return Ok(None);
    };
    let returned = returned.identifier;

    let mut uses: FxHashMap<IdentifierId, usize> = FxHashMap::default();
    visitors::visit_reactive_function(func, &UseCounter { env }, &mut uses);

    // Top-level instructions by their lvalue, and `const` declarations by their
    // variable.
    let mut defs: FxHashMap<IdentifierId, usize> = FxHashMap::default();
    let mut const_stores: FxHashMap<IdentifierId, usize> = FxHashMap::default();
    for (index, statement) in func.body.iter().enumerate() {
        if let ReactiveStatement::Instruction(instr) = statement {
            if let Some(lvalue) = &instr.lvalue {
                defs.insert(lvalue.identifier, index);
            }
            if let ReactiveValue::Instruction(InstructionValue::StoreLocal { lvalue, .. }) =
                &instr.value
            {
                if lvalue.kind == react_compiler_hir::InstructionKind::Const {
                    const_stores.insert(lvalue.place.identifier, index);
                }
            }
        }
    }
    let allocation_value = |index: usize| -> Option<&InstructionValue> {
        match &func.body[index] {
            ReactiveStatement::Instruction(instr) => match &instr.value {
                ReactiveValue::Instruction(value) if is_pure_allocation(value) => Some(value),
                _ => None,
            },
            _ => None,
        }
    };

    // The returned value must be a JSX element built at the top level, possibly
    // read through single-use temporaries.
    let Some(&element_index) = defs.get(&returned) else {
        return Ok(None);
    };
    if uses.get(&returned).copied() != Some(1) {
        return Ok(None);
    }
    let mut current = element_index;
    let key_place: Option<Place> = loop {
        match allocation_value(current) {
            Some(InstructionValue::JsxExpression { props, .. }) => {
                break props.iter().find_map(|attr| match attr {
                    react_compiler_hir::JsxAttribute::Attribute { name, place } if name == "key" => {
                        Some(place.clone())
                    }
                    _ => None,
                });
            }
            Some(InstructionValue::LoadLocal { place, .. })
                if env.identifiers[place.identifier.0 as usize].name.is_none()
                    && uses.get(&place.identifier).copied() == Some(1) =>
            {
                match defs.get(&place.identifier) {
                    Some(&def) if def < current => current = def,
                    _ => return Ok(None),
                }
            }
            _ => return Ok(None),
        }
    };

    // Collect the allocations: the element and, transitively, every operand that
    // is an unnamed, single-use top-level allocation.
    let mut allocations: FxHashSet<usize> = FxHashSet::default();
    let mut dependencies: Vec<Place> = Vec::new();
    let mut dependency_ids: FxHashSet<IdentifierId> = FxHashSet::default();
    let mut worklist = vec![element_index];
    allocations.insert(element_index);
    // A `const` holding an allocation that only one allocation reads is part of
    // the allocations too (component inlining binds values to such variables).
    let const_allocation = |id: IdentifierId| -> Option<(usize, IdentifierId)> {
        let store = *const_stores.get(&id)?;
        if store >= element_index || uses.get(&id).copied() != Some(1) {
            return None;
        }
        let ReactiveStatement::Instruction(instr) = &func.body[store] else {
            return None;
        };
        let ReactiveValue::Instruction(InstructionValue::StoreLocal { value, .. }) = &instr.value
        else {
            return None;
        };
        let value_def = *defs.get(&value.identifier)?;
        // A variable that only aliases another value (a read of a local) is a
        // dependency like the value it reads.
        (env.identifiers[value.identifier.0 as usize].name.is_none()
            && uses.get(&value.identifier).copied() == Some(1)
            && allocation_value(value_def)
                .is_some_and(|v| !matches!(v, InstructionValue::LoadLocal { .. })))
        .then_some((store, value.identifier))
    };
    while let Some(index) = worklist.pop() {
        let operands: Vec<Place> = match &func.body[index] {
            ReactiveStatement::Instruction(instr) => match &instr.value {
                ReactiveValue::Instruction(InstructionValue::StoreLocal { value, .. }) => {
                    vec![value.clone()]
                }
                ReactiveValue::Instruction(value) => {
                    react_compiler_hir::visitors::each_instruction_value_operand(value, env)
                }
                _ => unreachable!("allocations are instructions"),
            },
            _ => unreachable!("allocations are instructions"),
        };
        for operand in operands {
            let id = operand.identifier;
            let operand_def = defs.get(&id).copied();
            let is_allocation = operand_def.is_some_and(|def| {
                def < element_index
                    && env.identifiers[id.0 as usize].name.is_none()
                    && uses.get(&id).copied() == Some(1)
                    && allocation_value(def).is_some()
            });
            if is_allocation {
                let def = operand_def.unwrap();
                if allocations.insert(def) {
                    worklist.push(def);
                }
            } else if let Some((store, _value)) = const_allocation(id) {
                if allocations.insert(store) {
                    worklist.push(store);
                }
            } else if dependency_ids.insert(id) {
                dependencies.push(operand);
            }
        }
    }

    // The allocations move right before the return; no statement after the
    // first of them may reassign a variable they could read.
    let first_allocation = *allocations.iter().min().expect("the element is an allocation");
    if func.body[first_allocation..]
        .iter()
        .enumerate()
        .any(|(offset, statement)| {
            !allocations.contains(&(first_allocation + offset))
                && statement_reassigns(statement)
        })
    {
        return Ok(None);
    }

    // A dependency that is a temporary is computed before the scope, so it
    // needs a variable, as does the element, which is the scope's output.
    // Codegen tracks temporaries by declaration, and a value built by an
    // expression (such as a conditional) is assigned through other identifiers
    // of the same declaration, so every identifier of the declaration is named.
    let mut to_name: Vec<IdentifierId> = dependencies.iter().map(|p| p.identifier).collect();
    to_name.push(returned);
    for id in to_name {
        if env.identifiers[id.0 as usize].name.is_some() {
            continue;
        }
        let declaration = env.identifiers[id.0 as usize].declaration_id;
        let name = IdentifierName::Named(name_for("t"));
        for identifier in env.identifiers.iter_mut() {
            if identifier.declaration_id == declaration {
                identifier.name = Some(name.clone());
            }
        }
    }

    let scope = env.next_scope_id();
    {
        let scope_data = &mut env.scopes[scope.0 as usize];
        scope_data.dependencies = dependencies
            .iter()
            .map(|place| ReactiveScopeDependency {
                identifier: place.identifier,
                reactive: true,
                path: Vec::new(),
                loc: place.loc,
            })
            .collect();
        scope_data.declarations = vec![(
            returned,
            ReactiveScopeDeclaration {
                identifier: returned,
                scope,
            },
        )];
    }

    // Move the allocations, in order, into the scope before the return.
    let return_statement = func.body.pop().expect("the body ends with a return");
    let mut remaining: ReactiveBlock = Vec::with_capacity(func.body.len());
    let mut scope_instructions: ReactiveBlock = Vec::new();
    for (index, statement) in std::mem::take(&mut func.body).into_iter().enumerate() {
        if allocations.contains(&index) {
            scope_instructions.push(statement);
        } else {
            remaining.push(statement);
        }
    }
    remaining.push(ReactiveStatement::Scope(ReactiveScopeBlock {
        scope,
        instructions: scope_instructions,
    }));
    remaining.push(return_statement);
    func.body = remaining;
    Ok(Some(ListItemScope {
        output: returned,
        key: key_place
            .map(|place| place.identifier)
            .filter(|id| dependency_ids.contains(id)),
    }))
}
