// Copyright (c) Meta Platforms, Inc. and affiliates.
//
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.

//! Emits compiled block templates (see
//! `react_compiler_optimization::jsx_blocks`) as module-scope declarations:
//!
//! ```text
//! const BlockTemplate = unstable_createBlockTemplate([...description]);
//! ```

use rustc_hash::FxHashSet;

use react_compiler_ast::Program;
use react_compiler_ast::common::BaseNode;
use react_compiler_ast::expressions::{
    ArrayExpression, CallExpression, Expression, Identifier, ObjectExpression,
    ObjectExpressionProperty, ObjectProperty,
};
use react_compiler_ast::literals::{BooleanLiteral, NullLiteral, NumericLiteral, StringLiteral};
use react_compiler_ast::patterns::PatternLike;
use react_compiler_ast::statements::{
    Statement, VariableDeclaration, VariableDeclarationKind, VariableDeclarator,
};
use react_compiler_diagnostics::JsString;
use react_compiler_hir::block_template::{
    BlockChild, BlockNode, BlockStaticValue, BlockTemplate,
};

use super::imports::ProgramContext;

const BLOCK_RUNTIME_MODULE: &str = "react-dom";
const CREATE_BLOCK_TEMPLATE: &str = "unstable_createBlockTemplate";

/// Inserts a declaration for every template after the program's leading
/// imports, and registers the runtime import. Functions that use the same
/// template all list it under one name; each name is declared once.
pub fn insert_block_templates(
    program: &mut Program,
    templates: Vec<BlockTemplate>,
    context: &mut ProgramContext,
) {
    let mut declared: FxHashSet<String> = FxHashSet::default();
    let templates: Vec<BlockTemplate> = templates
        .into_iter()
        .filter(|template| declared.insert(template.name.clone()))
        .collect();
    if templates.is_empty() {
        return;
    }
    let factory = context
        .add_import_specifier(
            BLOCK_RUNTIME_MODULE,
            CREATE_BLOCK_TEMPLATE,
            Some("_createBlockTemplate"),
        )
        .name;
    let insert_at = program
        .body
        .iter()
        .take_while(|stmt| matches!(stmt, Statement::ImportDeclaration(_)))
        .count();
    let declarations: Vec<Statement> = templates
        .into_iter()
        .map(|template| {
            Statement::VariableDeclaration(VariableDeclaration {
                base: BaseNode::typed("VariableDeclaration"),
                kind: VariableDeclarationKind::Const,
                declarations: vec![VariableDeclarator {
                    base: BaseNode::typed("VariableDeclarator"),
                    id: PatternLike::Identifier(identifier(template.name)),
                    init: Some(Box::new(Expression::CallExpression(CallExpression {
                        base: BaseNode::typed("CallExpression"),
                        callee: Box::new(Expression::Identifier(identifier(factory.clone()))),
                        arguments: vec![node_description(&template.root)],
                        type_parameters: None,
                        type_arguments: None,
                        optional: None,
                    }))),
                    definite: None,
                }],
                declare: None,
            })
        })
        .collect();
    program.body.splice(insert_at..insert_at, declarations);
}

fn identifier(name: String) -> Identifier {
    Identifier {
        base: BaseNode::typed("Identifier"),
        name,
        type_annotation: None,
        optional: None,
        decorators: None,
    }
}

fn string(value: JsString) -> Expression {
    Expression::StringLiteral(StringLiteral {
        base: BaseNode::typed("StringLiteral"),
        value,
    })
}

fn number(value: f64) -> Expression {
    Expression::NumericLiteral(NumericLiteral {
        base: BaseNode::typed("NumericLiteral"),
        value,
        extra: None,
    })
}

fn null() -> Expression {
    Expression::NullLiteral(NullLiteral {
        base: BaseNode::typed("NullLiteral"),
    })
}

fn array(elements: Vec<Expression>) -> Expression {
    Expression::ArrayExpression(ArrayExpression {
        base: BaseNode::typed("ArrayExpression"),
        elements: elements.into_iter().map(Some).collect(),
    })
}

fn object(properties: Vec<(String, Expression)>) -> Expression {
    Expression::ObjectExpression(ObjectExpression {
        base: BaseNode::typed("ObjectExpression"),
        properties: properties
            .into_iter()
            .map(|(key, value)| {
                ObjectExpressionProperty::ObjectProperty(ObjectProperty {
                    base: BaseNode::typed("ObjectProperty"),
                    // String keys are valid for every prop name.
                    key: Box::new(string(JsString::from(key.as_str()))),
                    value: Box::new(value),
                    computed: false,
                    shorthand: false,
                    decorators: None,
                    method: None,
                })
            })
            .collect(),
    })
}

fn node_description(node: &BlockNode) -> Expression {
    let static_props = if node.static_props.is_empty() {
        null()
    } else {
        object(
            node.static_props
                .iter()
                .map(|(name, value)| {
                    let value = match value {
                        BlockStaticValue::String(s) => string(s.clone()),
                        BlockStaticValue::Number(n) => number(*n),
                        BlockStaticValue::Boolean(b) => {
                            Expression::BooleanLiteral(BooleanLiteral {
                                base: BaseNode::typed("BooleanLiteral"),
                                value: *b,
                            })
                        }
                        BlockStaticValue::Null => null(),
                    };
                    (name.clone(), value)
                })
                .collect(),
        )
    };
    let dynamic_props = if node.dynamic_props.is_empty() {
        null()
    } else {
        array(
            node.dynamic_props
                .iter()
                .map(|(name, hole)| {
                    array(vec![
                        string(JsString::from(name.as_str())),
                        number(*hole as f64),
                    ])
                })
                .collect(),
        )
    };
    let children = array(
        node.children
            .iter()
            .map(|child| match child {
                BlockChild::Text(text) => string(text.clone()),
                BlockChild::Element(element) => node_description(element),
                BlockChild::TextHole(hole) => object(vec![("t".to_string(), number(*hole as f64))]),
                BlockChild::Slot(hole) => object(vec![("s".to_string(), number(*hole as f64))]),
            })
            .collect(),
    );
    array(vec![
        string(JsString::from(node.tag.as_str())),
        static_props,
        dynamic_props,
        children,
    ])
}
