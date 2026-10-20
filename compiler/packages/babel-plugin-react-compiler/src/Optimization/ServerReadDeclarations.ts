/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {NodePath} from '@babel/core';
import type {Binding} from '@babel/traverse';
import * as t from '@babel/types';
import {CompilerError} from '../CompilerError';
import type {ParsedPluginOptions} from '../Entrypoint/Options';

export type ServerReadDeclaration = {
  name: string;
  result: 'unknown' | 'primitive' | 'immutable-data' | 'array';
};

/** Only the actual runtime imports establish this contract, never a spelling. */
export function discoverServerReads(
  program: NodePath<t.Program>,
  options?: Pick<
    ParsedPluginOptions,
    'ignoreUseNoForget' | 'customOptOutDirectives'
  >,
): Array<ServerReadDeclaration> {
  if (
    program.node.directives.some(
      ({value: {value}}) =>
        value === 'use client' ||
        value === 'use server' ||
        value === 'use react server preloads' ||
        (!options?.ignoreUseNoForget &&
          (value === 'use no memo' ||
            value === 'use no forget' ||
            options?.customOptOutDirectives?.includes(value) === true)),
    )
  ) {
    return [];
  }
  const factories = new Set<Binding>();
  const namespaces = new Set<Binding>();
  for (const statement of program.get('body')) {
    if (
      !statement.isImportDeclaration() ||
      statement.node.source.value !== 'react-compiler-runtime/server' ||
      (statement.node.importKind != null &&
        statement.node.importKind !== 'value')
    ) {
      continue;
    }
    for (const spec of statement.node.specifiers) {
      const binding = program.scope.getBinding(spec.local.name);
      if (binding === undefined || !binding.constant) continue;
      if (t.isImportNamespaceSpecifier(spec)) namespaces.add(binding);
      if (
        t.isImportSpecifier(spec) &&
        (spec.importKind == null || spec.importKind === 'value') &&
        t.isIdentifier(spec.imported) &&
        ['createServerRead', 'createBatchedResource'].includes(
          spec.imported.name,
        )
      ) {
        factories.add(binding);
      }
    }
  }
  const result: Array<ServerReadDeclaration> = [];
  for (const binding of Object.values(program.scope.bindings)) {
    if (
      !binding.constant ||
      binding.kind !== 'const' ||
      !binding.path.isVariableDeclarator()
    )
      continue;
    if (!t.isIdentifier(binding.path.node.id)) continue;
    const init = binding.path.node.init;
    if (!t.isCallExpression(init)) continue;
    const callee = init.callee;
    let recognized = false;
    if (t.isIdentifier(callee)) {
      const factory = binding.path.scope.getBinding(callee.name);
      recognized = factory !== undefined && factories.has(factory);
    } else if (
      t.isMemberExpression(callee) &&
      !callee.computed &&
      t.isIdentifier(callee.object) &&
      t.isIdentifier(callee.property) &&
      ['createServerRead', 'createBatchedResource'].includes(
        callee.property.name,
      )
    ) {
      const namespace = binding.path.scope.getBinding(callee.object.name);
      recognized = namespace !== undefined && namespaces.has(namespace);
    }
    if (!recognized) continue;
    let data: ServerReadDeclaration['result'] = 'unknown';
    const options = init.arguments[1];
    if (options !== undefined) {
      /*
       * No dynamic options, spreads or accessors: a runtime contract must agree
       * with the compiler's contract on every invocation/build.
       */
      if (
        !t.isObjectExpression(options) ||
        options.properties.some(
          prop =>
            !(
              t.isObjectProperty(prop) ||
              (t.isObjectMethod(prop) && prop.kind === 'method')
            ) ||
            prop.computed ||
            !(t.isIdentifier(prop.key) || t.isStringLiteral(prop.key)),
        )
      ) {
        CompilerError.throwInvalidConfig({
          reason: 'Server read options must be a static object',
          description: null,
          suggestions: null,
          loc: init.loc ?? null,
        });
      }
      const properties = (options as t.ObjectExpression).properties as Array<
        t.ObjectProperty | t.ObjectMethod
      >;
      for (const prop of properties) {
        const key = t.isIdentifier(prop.key)
          ? prop.key.name
          : (prop.key as t.StringLiteral).value;
        if (key !== 'result') continue;
        if (
          !t.isObjectProperty(prop) ||
          !t.isStringLiteral(prop.value) ||
          !['unknown', 'primitive', 'immutable-data', 'array'].includes(
            prop.value.value,
          )
        ) {
          CompilerError.throwInvalidConfig({
            reason: 'Server read result must be a literal result contract',
            description: null,
            suggestions: null,
            loc: prop.loc ?? null,
          });
        }
        data = ((prop as t.ObjectProperty).value as t.StringLiteral)
          .value as ServerReadDeclaration['result'];
      }
    }
    result.push({name: binding.identifier.name, result: data});
  }
  return result;
}
