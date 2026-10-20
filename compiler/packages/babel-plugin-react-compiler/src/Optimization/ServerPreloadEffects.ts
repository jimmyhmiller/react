/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {Binding, NodePath} from '@babel/traverse';
import * as t from '@babel/types';

export type ServerPreloadData =
  | 'unknown'
  | 'primitive'
  | 'immutable-data'
  | 'array';

/** These proofs describe values/effects, not TypeScript structural types. */
export type ServerPreloadValueProof = {
  data: ServerPreloadData;
  stable?: boolean | undefined;
  work?: boolean | undefined;
  pending?: ServerPreloadData | undefined;
  resolvedStable?: boolean | undefined;
  sequence?: {element: ServerPreloadData; pending: boolean} | undefined;
};

export function joinServerPreloadData(
  left: ServerPreloadData,
  right: ServerPreloadData,
): ServerPreloadData {
  return left === right
    ? left
    : left === 'unknown' || right === 'unknown'
      ? 'unknown'
      : 'immutable-data';
}

export function serverPreloadLiteral(
  node: t.Node | null | undefined,
): node is t.Expression {
  return (
    node != null &&
    (t.isStringLiteral(node) ||
      t.isNumericLiteral(node) ||
      t.isBooleanLiteral(node) ||
      t.isNullLiteral(node) ||
      t.isBigIntLiteral(node) ||
      (t.isUnaryExpression(node) &&
        ['+', '-'].includes(node.operator) &&
        t.isNumericLiteral(node.argument)))
  );
}

/**
 * Module records are proven only when primitive-valued and never exposed to a
 * writer. Reading a host style prop, copying an own field, or spreading a record
 * cannot mutate the original. Aliases, calls, writes and custom-component props
 * deliberately defeat this proof.
 */
export function immutableModuleRecord(binding: Binding): boolean {
  if (
    !binding.constant ||
    binding.kind !== 'const' ||
    binding.scope.parent != null ||
    !binding.path.isVariableDeclarator() ||
    !t.isObjectExpression(binding.path.node.init)
  )
    return false;
  const keys = new Set<string>();
  for (const prop of binding.path.node.init.properties) {
    if (
      !t.isObjectProperty(prop) ||
      prop.computed ||
      !(t.isIdentifier(prop.key) || t.isStringLiteral(prop.key)) ||
      !serverPreloadLiteral(prop.value)
    )
      return false;
    keys.add(t.isIdentifier(prop.key) ? prop.key.name : prop.key.value);
  }
  return binding.referencePaths.every(reference => {
    const parent = reference.parentPath;
    if (parent?.isSpreadElement() && parent.parentPath.isObjectExpression())
      return true;
    if (
      parent?.isMemberExpression() &&
      parent.node.object === reference.node &&
      !parent.node.computed &&
      t.isIdentifier(parent.node.property) &&
      keys.has(parent.node.property.name)
    ) {
      let use: NodePath<t.Node> = parent;
      while (
        use.parentPath?.isObjectProperty() ||
        use.parentPath?.isObjectPattern() ||
        use.parentPath?.isArrayPattern() ||
        use.parentPath?.isRestElement()
      )
        use = use.parentPath;
      const outer = use.parentPath;
      if (outer === null) return false;
      return (
        !(outer.isAssignmentExpression() && outer.node.left === use.node) &&
        !outer.isForOfStatement() &&
        !outer.isForInStatement() &&
        !outer.isUpdateExpression() &&
        !outer.isUnaryExpression({operator: 'delete'}) &&
        !(outer.isCallExpression() && outer.node.callee === use.node)
      );
    }
    if (
      parent?.isJSXExpressionContainer() &&
      parent.parentPath.isJSXAttribute()
    ) {
      const opening = parent.parentPath.parentPath;
      return (
        opening.isJSXOpeningElement() &&
        t.isJSXIdentifier(opening.node.name) &&
        /^[a-z]/.test(opening.node.name.name)
      );
    }
    return false;
  });
}

/**
 * Names are meaningful only after the receiver has an immutable plain-data
 * proof and all arguments have effect proofs. Function-valued own properties,
 * accessors and custom prototypes are excluded by that contract; native
 * intrinsics must be unmodified. Mutating methods never appear here.
 */
export const nativeServerReadMethods = new Map<string, ServerPreloadData>([
  ['toFixed', 'primitive'],
  ['toPrecision', 'primitive'],
  ['toExponential', 'primitive'],
  ['toString', 'primitive'],
  ['substring', 'primitive'],
  ['substr', 'primitive'],
  ['startsWith', 'primitive'],
  ['endsWith', 'primitive'],
  ['includes', 'primitive'],
  ['indexOf', 'primitive'],
  ['lastIndexOf', 'primitive'],
  ['charAt', 'primitive'],
  ['charCodeAt', 'primitive'],
  ['toUpperCase', 'primitive'],
  ['toLowerCase', 'primitive'],
  ['trim', 'primitive'],
  ['trimStart', 'primitive'],
  ['trimEnd', 'primitive'],
  ['join', 'primitive'],
  ['slice', 'immutable-data'],
  ['concat', 'immutable-data'],
  ['at', 'immutable-data'],
]);
