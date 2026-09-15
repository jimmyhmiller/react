// Copyright (c) Meta Platforms, Inc. and affiliates.
//
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.

//! Module-level analysis for component inlining.
//!
//! Finds module-scope function components that satisfy the AST-level rules of
//! `compiler/docs/experiments/0001-component-inlining.md`:
//!
//! - C1: declared at module scope (`function C() {}` or `const C = () => {}`,
//!   optionally exported) and never reassigned.
//! - C2: every reference is a JSX element name or an export specifier.
//! - No opt-out directive (`'use no memo'` / `'use no forget'`).
//!
//! The HIR-level callee rules and the standalone compilation check (C5) are
//! applied by `program.rs`, which owns the compilation queue.

use rustc_hash::FxHashSet;

use react_compiler_ast::Program;
use react_compiler_ast::declarations::{
    Declaration, ExportDefaultDecl, ExportSpecifier, ModuleExportName,
};
use react_compiler_ast::expressions::{ArrowFunctionBody, Expression};
use react_compiler_ast::jsx::{JSXElement, JSXElementName};
use react_compiler_ast::patterns::PatternLike;
use react_compiler_ast::scope::{BindingKind, ScopeId, ScopeInfo};
use react_compiler_ast::statements::{
    Statement, VariableDeclaration, VariableDeclarationKind,
};
use react_compiler_ast::visitor::{AstWalker, Visitor};
use react_compiler_lowering::FunctionNode;

const OPT_OUT_DIRECTIVES: &[&str] = &["use no forget", "use no memo"];

/// A module-scope component that passed the AST-level inlining rules.
pub struct ModuleComponent<'a> {
    pub name: String,
    pub node: FunctionNode<'a>,
    pub node_id: Option<u32>,
}

/// Returns the module-scope components that satisfy rules C1 and C2 and have
/// no opt-out directive.
pub fn find_module_components<'a>(
    program: &'a Program,
    scope: &ScopeInfo,
) -> Vec<ModuleComponent<'a>> {
    let mut declared: Vec<ModuleComponent<'a>> = Vec::new();
    let mut export_reference_ids: FxHashSet<u32> = FxHashSet::default();
    for statement in &program.body {
        match statement {
            Statement::FunctionDeclaration(decl) => {
                push_function_declaration(&mut declared, decl);
            }
            Statement::VariableDeclaration(decl) => {
                push_variable_declaration(&mut declared, decl);
            }
            Statement::ExportNamedDeclaration(export) => {
                match export.declaration.as_deref() {
                    Some(Declaration::FunctionDeclaration(decl)) => {
                        push_function_declaration(&mut declared, decl);
                    }
                    Some(Declaration::VariableDeclaration(decl)) => {
                        push_variable_declaration(&mut declared, decl);
                    }
                    _ => {}
                }
                if export.source.is_none() {
                    for specifier in &export.specifiers {
                        if let ExportSpecifier::ExportSpecifier(data) = specifier {
                            if let ModuleExportName::Identifier(local) = &data.local {
                                if let Some(id) = local.base.node_id {
                                    export_reference_ids.insert(id);
                                }
                            }
                        }
                    }
                }
            }
            Statement::ExportDefaultDeclaration(export) => match export.declaration.as_ref() {
                ExportDefaultDecl::FunctionDeclaration(decl) => {
                    push_function_declaration(&mut declared, decl);
                }
                ExportDefaultDecl::Expression(expr) => {
                    if let Expression::Identifier(ident) = expr.as_ref() {
                        if let Some(id) = ident.base.node_id {
                            export_reference_ids.insert(id);
                        }
                    }
                }
                _ => {}
            },
            _ => {}
        }
    }
    // A name declared more than once is not a single known function.
    let mut seen: FxHashSet<String> = FxHashSet::default();
    let duplicates: FxHashSet<String> = declared
        .iter()
        .filter(|c| !seen.insert(c.name.clone()))
        .map(|c| c.name.clone())
        .collect();
    declared.retain(|c| !duplicates.contains(&c.name));
    if declared.is_empty() {
        return declared;
    }

    let mut jsx_names = JsxNameCollector {
        node_ids: FxHashSet::default(),
    };
    AstWalker::new(scope).walk_program(&mut jsx_names, program);

    let program_scope = &scope.scopes[scope.program_scope.0 as usize];
    declared.retain(|component| {
        if !component.name.starts_with(|c: char| c.is_ascii_uppercase()) {
            return false;
        }
        let Some(&binding_id) = program_scope.bindings.get(&component.name) else {
            return false;
        };
        let binding = &scope.bindings[binding_id.0 as usize];
        // Rule C1: a function declaration or a `const` binding.
        if !matches!(binding.kind, BindingKind::Hoisted | BindingKind::Const) {
            return false;
        }
        // Rule C2: every reference is a JSX element name or an export.
        scope
            .ref_node_id_to_binding
            .iter()
            .filter(|(_, b)| **b == binding_id)
            .all(|(node_id, _)| {
                Some(*node_id) == binding.declaration_node_id
                    || jsx_names.node_ids.contains(node_id)
                    || export_reference_ids.contains(node_id)
            })
    });
    declared
}

fn has_opt_out(directives: &[react_compiler_ast::statements::Directive]) -> bool {
    directives
        .iter()
        .any(|d| OPT_OUT_DIRECTIVES.contains(&d.value.value.as_str()))
}

fn push_function_declaration<'a>(
    out: &mut Vec<ModuleComponent<'a>>,
    decl: &'a react_compiler_ast::statements::FunctionDeclaration,
) {
    let Some(id) = &decl.id else {
        return;
    };
    if has_opt_out(&decl.body.directives) {
        return;
    }
    out.push(ModuleComponent {
        name: id.name.clone(),
        node: FunctionNode::FunctionDeclaration(decl),
        node_id: decl.base.node_id,
    });
}

fn push_variable_declaration<'a>(
    out: &mut Vec<ModuleComponent<'a>>,
    decl: &'a VariableDeclaration,
) {
    if !matches!(decl.kind, VariableDeclarationKind::Const) {
        return;
    }
    for declarator in &decl.declarations {
        let PatternLike::Identifier(id) = &declarator.id else {
            continue;
        };
        let Some(init) = declarator.init.as_deref() else {
            continue;
        };
        match init {
            Expression::ArrowFunctionExpression(arrow) => {
                if let ArrowFunctionBody::BlockStatement(block) = arrow.body.as_ref() {
                    if has_opt_out(&block.directives) {
                        continue;
                    }
                }
                out.push(ModuleComponent {
                    name: id.name.clone(),
                    node: FunctionNode::ArrowFunctionExpression(arrow),
                    node_id: arrow.base.node_id,
                });
            }
            Expression::FunctionExpression(func) => {
                if has_opt_out(&func.body.directives) {
                    continue;
                }
                out.push(ModuleComponent {
                    name: id.name.clone(),
                    node: FunctionNode::FunctionExpression(func),
                    node_id: func.base.node_id,
                });
            }
            _ => {}
        }
    }
}

/// Collects the node ids of identifiers used as the name of a JSX opening or
/// closing element (but not as the object of a member expression tag).
struct JsxNameCollector {
    node_ids: FxHashSet<u32>,
}

impl<'ast> Visitor<'ast> for JsxNameCollector {
    fn enter_jsx_element(&mut self, node: &'ast JSXElement, _scope_stack: &[ScopeId]) {
        if let JSXElementName::JSXIdentifier(name) = &node.opening_element.name {
            if let Some(id) = name.base.node_id {
                self.node_ids.insert(id);
            }
        }
        if let Some(closing) = &node.closing_element {
            if let JSXElementName::JSXIdentifier(name) = &closing.name {
                if let Some(id) = name.base.node_id {
                    self.node_ids.insert(id);
                }
            }
        }
    }
}
