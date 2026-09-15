// Copyright (c) Meta Platforms, Inc. and affiliates.
//
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.

//! Registration of external store hooks (`enableContextSelectors`).
//!
//! A call of a custom hook is selected by `SelectContextReads`
//! (react_compiler_optimization `context_selectors`): React only applies the
//! description of the values the component reads from the returned value if
//! the hook is registered. A store hook returns the snapshot of the one
//! `useSyncExternalStore` it calls, for every snapshot, so that a component
//! whose selection of the snapshot did not change renders the same output.
//!
//! The hooks of external store libraries are not compiled, so their contract
//! is known here by module:
//!
//! - `useSelector` of `react-redux` and `useStore` of `zustand` return the
//!   selection of the store's state by their selector argument.
//! - The value of `create(initializer)` or `create()(initializer)` of
//!   `zustand` is a hook that returns the selection of its store's state.
//!
//! A module registers (`unstable_registerStoreHook`) the library hooks it
//! imports, after the import, and the hooks it defines with `const useX =
//! create(...)`, after the declaration. React also checks that a registered
//! hook's call read exactly one store and returned its snapshot.

use react_compiler_ast::Program;
use react_compiler_ast::common::BaseNode;
use react_compiler_ast::declarations::Declaration;
use react_compiler_ast::declarations::ImportKind;
use react_compiler_ast::declarations::ImportSpecifier;
use react_compiler_ast::declarations::ModuleExportName;
use react_compiler_ast::expressions::*;
use react_compiler_ast::patterns::PatternLike;
use react_compiler_ast::statements::*;

use super::imports::ProgramContext;
use super::program::is_hook_name;

/// Library hooks that return the selection of a store's state.
const STORE_HOOKS: &[(&str, &str)] = &[
    ("react-redux", "useSelector"),
    ("zustand", "useStore"),
    ("zustand/react", "useStore"),
];

/// Library functions that create a store hook.
const STORE_HOOK_FACTORIES: &[(&str, &str)] = &[("zustand", "create"), ("zustand/react", "create")];

fn is_listed(list: &[(&str, &str)], source: &str, imported: &str) -> bool {
    list.iter()
        .any(|(module, name)| *module == source && *name == imported)
}

/// The store hooks of a module: indices of the top-level statements after
/// which to register each hook, by local name.
fn find_store_hooks(program: &Program) -> Vec<(usize, String)> {
    let mut factories: Vec<String> = Vec::new();
    let mut hooks = Vec::new();
    for (index, statement) in program.body.iter().enumerate() {
        let declaration = match statement {
            Statement::ImportDeclaration(import) => {
                if matches!(
                    import.import_kind,
                    Some(ImportKind::Type) | Some(ImportKind::Typeof)
                ) {
                    continue;
                }
                let Some(source) = import.source.value.as_str() else {
                    continue;
                };
                for specifier in &import.specifiers {
                    let ImportSpecifier::ImportSpecifier(data) = specifier else {
                        continue;
                    };
                    if matches!(
                        data.import_kind,
                        Some(ImportKind::Type) | Some(ImportKind::Typeof)
                    ) {
                        continue;
                    }
                    let imported = match &data.imported {
                        ModuleExportName::Identifier(id) => id.name.as_str(),
                        ModuleExportName::StringLiteral(s) => match s.value.as_str() {
                            Some(value) => value,
                            None => continue,
                        },
                    };
                    if is_listed(STORE_HOOKS, source, imported) {
                        hooks.push((index, data.local.name.clone()));
                    } else if is_listed(STORE_HOOK_FACTORIES, source, imported) {
                        factories.push(data.local.name.clone());
                    }
                }
                continue;
            }
            Statement::VariableDeclaration(declaration) => declaration,
            Statement::ExportNamedDeclaration(export) => match export.declaration.as_deref() {
                Some(Declaration::VariableDeclaration(declaration)) => declaration,
                _ => continue,
            },
            _ => continue,
        };
        if !matches!(declaration.kind, VariableDeclarationKind::Const) {
            continue;
        }
        for declarator in &declaration.declarations {
            let PatternLike::Identifier(id) = &declarator.id else {
                continue;
            };
            if !is_hook_name(&id.name) {
                continue;
            }
            if let Some(init) = &declarator.init {
                if creates_store_hook(init, &factories) {
                    hooks.push((index, id.name.clone()));
                }
            }
        }
    }
    hooks
}

/// `create(initializer)` or `create()(initializer)`, where `create` is an
/// imported store hook factory (imports cannot be reassigned or shadowed at
/// the top level).
fn creates_store_hook(expression: &Expression, factories: &[String]) -> bool {
    let Expression::CallExpression(call) = expression else {
        return false;
    };
    if call.arguments.len() != 1 {
        return false;
    }
    let is_factory = |callee: &Expression| matches!(callee, Expression::Identifier(id) if factories.contains(&id.name));
    match call.callee.as_ref() {
        callee if is_factory(callee) => true,
        Expression::CallExpression(inner) => {
            inner.arguments.is_empty() && is_factory(inner.callee.as_ref())
        }
        _ => false,
    }
}

/// Adds `unstable_registerStoreHook(useX)` after the import or declaration of
/// each store hook of the module. Returns whether anything was added.
pub fn register_store_hooks(program: &mut Program, context: &mut ProgramContext) -> bool {
    let hooks = find_store_hooks(program);
    if hooks.is_empty() {
        return false;
    }
    let module = context.react_runtime_module.clone();
    let register = context
        .add_import_specifier(&module, "unstable_registerStoreHook", None)
        .name;
    // Insert from the last statement so that earlier indices stay valid; the
    // registrations after one statement keep their order.
    for (index, name) in hooks.into_iter().rev() {
        let identifier = |name: String| Identifier {
            base: BaseNode::typed("Identifier"),
            name,
            type_annotation: None,
            optional: None,
            decorators: None,
        };
        let statement = Statement::ExpressionStatement(ExpressionStatement {
            base: BaseNode::typed("ExpressionStatement"),
            expression: Box::new(Expression::CallExpression(CallExpression {
                base: BaseNode::typed("CallExpression"),
                callee: Box::new(Expression::Identifier(identifier(register.clone()))),
                arguments: vec![Expression::Identifier(identifier(name))],
                type_parameters: None,
                type_arguments: None,
                optional: None,
            })),
        });
        program.body.insert(index + 1, statement);
    }
    true
}
