// Copyright (c) Meta Platforms, Inc. and affiliates.
//
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.

//! Compiled block templates produced by the `CompileJsxBlocks` pass.
//!
//! A template is emitted at module scope as
//! `const Name = unstable_createBlockTemplate(description)`. The description
//! format is defined by the React DOM runtime in
//! `packages/react-dom-bindings/src/client/ReactDOMBlocks.js`:
//!
//! ```text
//! Node  = [tag, staticProps | null, dynamicProps | null, children]
//! dynamicProps = Array<[propName, holeIndex]>
//! Child = string | Node | {t: holeIndex} | {s: holeIndex}
//! ```

use react_compiler_diagnostics::JsString;

/// What a compiled function returns, in terms of compiled blocks. Ordered:
/// every leaf block is a block.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default)]
pub enum ReturnsBlock {
    /// Some returned value is not a block element.
    #[default]
    No,
    /// Every returned value is a block element.
    Block,
    /// Every returned value is a block element whose slots never hold JSX
    /// elements, so it can be rendered as a list item without fibers.
    LeafBlock,
}

#[derive(Debug, Clone)]
pub struct BlockTemplate {
    /// Module-scope binding name of the template.
    pub name: String,
    pub root: BlockNode,
}

#[derive(Debug, Clone)]
pub struct BlockNode {
    pub tag: String,
    pub static_props: Vec<(String, BlockStaticValue)>,
    pub dynamic_props: Vec<(String, u32)>,
    pub children: Vec<BlockChild>,
}

#[derive(Debug, Clone)]
pub enum BlockStaticValue {
    String(JsString),
    Number(f64),
    Boolean(bool),
    Null,
}

#[derive(Debug, Clone)]
pub enum BlockChild {
    Text(JsString),
    Element(BlockNode),
    TextHole(u32),
    Slot(u32),
}

impl BlockNode {
    /// A string that is equal for two nodes exactly when they describe the
    /// same template, used to emit identical templates only once per module.
    pub fn structure_key(&self) -> String {
        let mut key = String::new();
        self.write_structure_key(&mut key);
        key
    }

    fn write_structure_key(&self, key: &mut String) {
        use std::fmt::Write;
        // Every variable-length part is length-prefixed so that distinct
        // structures cannot produce the same key.
        let _ = write!(key, "[{}:{}", self.tag.len(), self.tag);
        let _ = write!(key, "|s{}", self.static_props.len());
        for (name, value) in &self.static_props {
            let _ = write!(key, ";{}:{}=", name.len(), name);
            match value {
                BlockStaticValue::String(s) => {
                    let text = format!("{:?}", s);
                    let _ = write!(key, "S{}:{}", text.len(), text);
                }
                BlockStaticValue::Number(n) => {
                    let _ = write!(key, "N{}", n.to_bits());
                }
                BlockStaticValue::Boolean(b) => {
                    let _ = write!(key, "B{}", b);
                }
                BlockStaticValue::Null => key.push('Z'),
            }
        }
        let _ = write!(key, "|d{}", self.dynamic_props.len());
        for (name, hole) in &self.dynamic_props {
            let _ = write!(key, ";{}:{}={}", name.len(), name, hole);
        }
        let _ = write!(key, "|c{}", self.children.len());
        for child in &self.children {
            match child {
                BlockChild::Text(text) => {
                    let text = format!("{:?}", text);
                    let _ = write!(key, ";T{}:{}", text.len(), text);
                }
                BlockChild::Element(node) => {
                    key.push_str(";E");
                    node.write_structure_key(key);
                }
                BlockChild::TextHole(hole) => {
                    let _ = write!(key, ";t{}", hole);
                }
                BlockChild::Slot(hole) => {
                    let _ = write!(key, ";s{}", hole);
                }
            }
        }
        key.push(']');
    }
}
