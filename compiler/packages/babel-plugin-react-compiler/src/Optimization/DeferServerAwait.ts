/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {NodePath} from '@babel/core';
import type {Binding} from '@babel/traverse';
import * as t from '@babel/types';
import type {CompilerPass} from '../Entrypoint/Program';

const DIRECTIVE = 'use defer to suspense';
const MARKER = 'use react deferred props';

/**
 * Prepare on original syntax; apply after preload extraction so generated reads
 * cannot conceal dependencies. This semantic transform requires a source opt-in.
 */
export function prepareDeferredServerAwaits(
  program: NodePath<t.Program>,
  pass: CompilerPass,
): () => void {
  const config = pass.opts.serverPreloads;
  if (
    config == null ||
    !config.features.deferAwait ||
    config.runtime == null ||
    program.node.directives.some(
      d =>
        d.value.value === MARKER ||
        d.value.value === 'use client' ||
        d.value.value === 'use server' ||
        d.value.value === 'use react server preloads' ||
        (!pass.opts.ignoreUseNoForget &&
          [
            'use no memo',
            'use no forget',
            ...(pass.opts.customOptOutDirectives ?? []),
          ].includes(d.value.value)),
    )
  ) {
    return (): void => {};
  }
  const resources = new Set<Binding>();
  const suspense = new Set<Binding>();
  const containers = new Set<Binding>();
  const namespaces = new Set<Binding>();
  for (const statement of program.get('body')) {
    if (
      !statement.isImportDeclaration() ||
      (statement.node.importKind != null &&
        statement.node.importKind !== 'value')
    ) {
      continue;
    }
    for (const specifier of statement.node.specifiers) {
      const binding = program.scope.getBinding(specifier.local.name);
      if (binding == null || !binding.constant) {
        continue;
      }
      if (statement.node.source.value === 'react') {
        if (
          t.isImportNamespaceSpecifier(specifier) ||
          t.isImportDefaultSpecifier(specifier)
        ) {
          namespaces.add(binding);
        }
        if (
          t.isImportSpecifier(specifier) &&
          (specifier.importKind == null || specifier.importKind === 'value')
        ) {
          const name = t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value;
          if (name === 'Suspense') {
            suspense.add(binding);
            containers.add(binding);
          }
          if (name === 'Fragment') {
            containers.add(binding);
          }
        }
      }
      if (
        t.isImportNamespaceSpecifier(specifier) ||
        (t.isImportSpecifier(specifier) &&
          specifier.importKind != null &&
          specifier.importKind !== 'value')
      ) {
        continue;
      }
      const name = t.isImportDefaultSpecifier(specifier)
        ? 'default'
        : t.isIdentifier(specifier.imported)
          ? specifier.imported.name
          : specifier.imported.value;
      if (
        config.resources.some(
          resource =>
            resource.source === statement.node.source.value &&
            resource.importSpecifierName === name,
        )
      ) {
        resources.add(binding);
      }
    }
  }
  for (const resource of config.localResources) {
    const binding = program.scope.getBinding(resource.name);
    if (binding?.constant) {
      resources.add(binding);
    }
  }
  const isContainer = (
    name: t.JSXElement['openingElement']['name'],
    scope: NodePath['scope'],
    onlySuspense = false,
  ): boolean => {
    if (t.isJSXIdentifier(name)) {
      const binding = scope.getBinding(name.name);
      return (
        binding != null && (onlySuspense ? suspense : containers).has(binding)
      );
    }
    if (t.isJSXMemberExpression(name) && t.isJSXIdentifier(name.object)) {
      const binding = scope.getBinding(name.object.name);
      return (
        binding != null &&
        namespaces.has(binding) &&
        (name.property.name === 'Suspense' ||
          (!onlySuspense && name.property.name === 'Fragment'))
      );
    }
    return false;
  };
  const pending: Array<() => void> = [];
  let readImport: t.Identifier | null = null;
  let flagImport: t.Identifier | null = null;
  const runtime = (name: 'read' | 'shouldDeferAwait'): t.Identifier => {
    let id = name === 'read' ? readImport : flagImport;
    if (id === null) {
      id = program.scope.generateUidIdentifier(
        name === 'read' ? 'deferredRead' : 'shouldDeferAwait',
      );
      if (name === 'read') {
        readImport = id;
      } else {
        flagImport = id;
      }
    }
    return t.cloneNode(id);
  };
  program.traverse({
    Function(fn) {
      if (
        !(
          fn.isFunctionDeclaration() ||
          fn.isFunctionExpression() ||
          fn.isArrowFunctionExpression()
        ) ||
        fn.node.generator ||
        !fn.node.async ||
        !t.isBlockStatement(fn.node.body) ||
        !fn.node.body.directives.some(d => d.value.value === DIRECTIVE)
      ) {
        return;
      }
      const report = (
        reason: string,
        action: 'retain' | 'preload' = 'retain',
      ): void => {
        pass.opts.logger?.logEvent(pass.filename, {
          kind: 'ServerPreload',
          fnLoc: fn.node.loc ?? null,
          loc: fn.node.loc ?? null,
          action,
          reason,
        });
      };
      if (
        fn.node.body.directives.some(
          d =>
            !pass.opts.ignoreUseNoForget &&
            [
              'use no memo',
              'use no forget',
              ...(pass.opts.customOptOutDirectives ?? []),
            ].includes(d.value.value),
        ) ||
        (pass.opts.compilationMode === 'annotation' &&
          !fn.node.body.directives.some(
            d => d.value.value === 'use memo' || d.value.value === 'use forget',
          )) ||
        fn.scope.parent !== program.scope ||
        pass.opts.compilationMode === 'syntax'
      ) {
        report('Deferred await requires a selected module-level component');
        return;
      }
      const declared =
        fn.parentPath.isVariableDeclarator() &&
        t.isIdentifier(fn.parentPath.node.id)
          ? fn.parentPath.node.id
          : t.isFunctionDeclaration(fn.node) || t.isFunctionExpression(fn.node)
            ? (fn.node.id ?? null)
            : null;
      const componentBinding =
        declared == null ? null : program.scope.getBinding(declared.name);
      if (
        (declared != null && !/^[A-Z]/.test(declared.name)) ||
        componentBinding?.referencePaths.some(
          reference =>
            reference.parentPath?.isCallExpression() &&
            reference.parentPath.node.callee === reference.node,
        )
      ) {
        report(
          'Deferred await requires a React component, not an imperatively invoked helper',
        );
        return;
      }
      const statements = (fn.get('body') as NodePath<t.BlockStatement>).get(
        'body',
      ) as Array<NodePath<t.Statement>>;
      if (statements.length < 2) {
        report(
          'Deferred await requires a direct read followed by a JSX return',
        );
        return;
      }
      const declaration = statements[statements.length - 2];
      const returned = statements[statements.length - 1];
      if (
        !declaration.isVariableDeclaration({kind: 'const'}) ||
        declaration.node.declarations.length !== 1 ||
        !returned.isReturnStatement() ||
        returned.node.argument == null ||
        (!t.isJSXElement(returned.node.argument) &&
          !t.isJSXFragment(returned.node.argument))
      ) {
        report(
          'Deferred await retains catches, effects and non-tail consumers',
        );
        return;
      }
      const item = declaration.node.declarations[0];
      if (
        !t.isIdentifier(item.id) ||
        !t.isAwaitExpression(item.init) ||
        !t.isCallExpression(item.init.argument) ||
        !t.isIdentifier(item.init.argument.callee)
      ) {
        report('Deferred await requires a direct trusted resource read');
        return;
      }
      const call = item.init.argument;
      const resource = declaration.scope.getBinding(
        (call.callee as t.Identifier).name,
      );
      const binding = declaration.scope.getBinding(item.id.name);
      if (
        resource == null ||
        !resources.has(resource) ||
        binding == null ||
        !binding.constant ||
        binding.referencePaths.length !== 1
      ) {
        report('Deferred data must have exactly one JSX prop consumer');
        return;
      }
      const reference = binding.referencePaths[0];
      const attribute = reference.parentPath?.parentPath;
      const target = attribute?.parentPath?.parentPath;
      if (
        !reference.parentPath?.isJSXExpressionContainer() ||
        !attribute?.isJSXAttribute() ||
        !target?.isJSXElement() ||
        target.findParent(parent => parent.node === returned.node) == null ||
        !t.isJSXIdentifier(target.node.openingElement.name) ||
        !/^[A-Z]/.test(target.node.openingElement.name.name)
      ) {
        report('Deferred data must be a direct prop of a stable component');
        return;
      }
      const targetBinding = target.scope.getBinding(
        target.node.openingElement.name.name,
      );
      if (
        targetBinding == null ||
        !targetBinding.constant ||
        targetBinding.scope !== program.scope ||
        target.node.children.some(
          child => !t.isJSXText(child) || child.value.trim() !== '',
        )
      ) {
        report(
          'Deferred target must be module-stable and have no JSX children',
        );
        return;
      }
      let underSuspense = false;
      let ancestrySafe = true;
      for (
        let parent: NodePath | null = target.parentPath;
        parent != null && parent !== returned;
        parent = parent.parentPath
      ) {
        if (
          parent.isJSXAttribute() ||
          parent.isConditionalExpression() ||
          parent.isLogicalExpression()
        ) {
          ancestrySafe = false;
        }
        if (parent.isJSXElement()) {
          const name = parent.node.openingElement.name;
          underSuspense ||= isContainer(name, parent.scope, true);
          if (
            !(t.isJSXIdentifier(name) && /^[a-z]/.test(name.name)) &&
            !isContainer(name, parent.scope)
          ) {
            ancestrySafe = false;
          }
        }
      }
      const safe = (node: t.Node | null | undefined): boolean => {
        if (
          node == null ||
          t.isStringLiteral(node) ||
          t.isNumericLiteral(node) ||
          t.isBooleanLiteral(node) ||
          t.isNullLiteral(node) ||
          t.isBigIntLiteral(node) ||
          t.isJSXText(node) ||
          t.isJSXEmptyExpression(node)
        ) {
          return true;
        }
        if (t.isIdentifier(node)) {
          const value = fn.scope.getBinding(node.name);
          return (
            value != null &&
            value.kind !== 'module' &&
            value.constant &&
            (value === binding ||
              value.kind === 'param' ||
              (value.path.node.start != null &&
                item.start != null &&
                value.path.node.start < item.start))
          );
        }
        if (t.isJSXExpressionContainer(node)) {
          return safe(node.expression);
        }
        if (t.isJSXFragment(node)) {
          return node.children.every(safe);
        }
        if (t.isJSXElement(node)) {
          const name = node.openingElement.name;
          const fixed = t.isJSXIdentifier(name) || isContainer(name, fn.scope);
          return (
            fixed &&
            node.openingElement.attributes.every(
              attr =>
                t.isJSXAttribute(attr) &&
                t.isJSXIdentifier(attr.name) &&
                attr.name.name !== 'key' &&
                attr.name.name !== 'ref' &&
                safe(attr.value),
            ) &&
            node.children.every(safe)
          );
        }
        return false;
      };
      if (
        !underSuspense ||
        !ancestrySafe ||
        !safe(returned.node.argument) ||
        !call.arguments.every(arg => t.isExpression(arg) && safe(arg))
      ) {
        report(
          'Deferred await needs an unconditional Suspense child and pure prop/argument evaluation',
        );
        return;
      }
      report(
        'Opt-in deferred prop consumes the read inside the existing Suspense boundary; the runtime switch retains the parent await when disabled',
        'preload',
      );
      if (pass.opts.noEmit || config.mode !== 'compile') {
        return;
      }
      pending.push(() => {
        const current = item.init;
        let task: t.Expression;
        if (
          t.isMemberExpression(current) &&
          t.isAwaitExpression(current.object) &&
          t.isIdentifier(current.property, {name: 'value'})
        ) {
          task = t.cloneNode(current.object.argument, true);
        } else {
          task = t.callExpression(runtime('read'), [
            t.cloneNode(call.callee as t.Identifier),
            t.arrayExpression(
              call.arguments.map(arg => t.cloneNode(arg as t.Expression, true)),
            ),
            t.stringLiteral(
              `${pass.filename ?? '<server>'}:deferred:${call.loc?.start.line ?? 0}:${call.loc?.start.column ?? 0}`,
            ),
          ]);
        }
        const enabled = fn.scope.generateUidIdentifier('deferAwait');
        const promise = fn.scope.generateUidIdentifier('deferredTask');
        const wrapper = program.scope.generateUidIdentifier(
          'Deferred' +
            (target.node.openingElement.name as t.JSXIdentifier).name,
        );
        const pendingProp = program.scope.generateUidIdentifier('pending');
        const resolved = program.scope.generateUidIdentifier('resolved');
        const child = t.cloneNode(target.node, true);
        const attributes: Array<t.JSXAttribute> = [
          t.jsxAttribute(
            t.jsxIdentifier('pending'),
            t.jsxExpressionContainer(t.cloneNode(promise)),
          ),
        ];
        const properties: Array<t.ObjectProperty> = [
          t.objectProperty(t.identifier('pending'), pendingProp),
        ];
        child.openingElement.attributes.forEach((attr, index) => {
          if (
            !t.isJSXAttribute(attr) ||
            !t.isJSXExpressionContainer(attr.value)
          ) {
            return;
          }
          if (
            t.isIdentifier(attr.value.expression, {
              name: (item.id as t.Identifier).name,
            })
          ) {
            attr.value.expression = t.cloneNode(resolved);
          } else {
            const prop = 'argument' + index;
            const parameter = program.scope.generateUidIdentifier(prop);
            attributes.push(
              t.jsxAttribute(
                t.jsxIdentifier(prop),
                t.cloneNode(attr.value, true),
              ),
            );
            properties.push(t.objectProperty(t.identifier(prop), parameter));
            attr.value.expression = t.cloneNode(parameter);
          }
        });
        const element = t.jsxElement(
          t.jsxOpeningElement(t.jsxIdentifier(wrapper.name), attributes, true),
          null,
          [],
          true,
        );
        const root = returned.node.argument!;
        const early = t.cloneNode(root, true);
        const steps: Array<{key: string; index: number | null}> = [];
        for (let cursor: NodePath = target; cursor.node !== root; ) {
          steps.unshift({
            key: cursor.listKey ?? String(cursor.key),
            index: cursor.listKey == null ? null : Number(cursor.key),
          });
          if (cursor.parentPath == null) {
            throw new Error('Deferred target lost its return expression');
          }
          cursor = cursor.parentPath;
        }
        let container = early as unknown as Record<string, unknown>;
        for (let index = 0; index < steps.length; index++) {
          const step = steps[index];
          if (index === steps.length - 1) {
            if (step.index === null) {
              container[step.key] = element;
            } else {
              (container[step.key] as Array<t.Node>)[step.index] = element;
            }
          } else {
            container = (
              step.index === null
                ? container[step.key]
                : (container[step.key] as Array<t.Node>)[step.index]
            ) as Record<string, unknown>;
          }
        }
        // Preserve the original binding/type and JSX in the disabled continuation.
        item.init = t.memberExpression(
          t.awaitExpression(t.cloneNode(promise)),
          t.identifier('value'),
        );
        declaration.insertBefore([
          t.variableDeclaration('const', [
            t.variableDeclarator(
              enabled,
              t.callExpression(runtime('shouldDeferAwait'), []),
            ),
          ]),
          t.variableDeclaration('const', [t.variableDeclarator(promise, task)]),
          t.ifStatement(
            t.cloneNode(enabled),
            t.blockStatement([t.returnStatement(early)]),
          ),
        ]);
        program.pushContainer(
          'body',
          t.functionDeclaration(
            wrapper,
            [t.objectPattern(properties)],
            t.blockStatement([
              t.variableDeclaration('const', [
                t.variableDeclarator(
                  resolved,
                  t.memberExpression(
                    t.awaitExpression(t.cloneNode(pendingProp)),
                    t.identifier('value'),
                  ),
                ),
              ]),
              t.returnStatement(child),
            ]),
            false,
            true,
          ),
        );
      });
    },
  });
  return (): void => {
    for (const apply of pending) {
      apply();
    }
    if (pending.length === 0) {
      return;
    }
    const imports: Array<t.ImportSpecifier> = [];
    if (readImport !== null) {
      imports.push(t.importSpecifier(readImport, t.identifier('read')));
    }
    if (flagImport !== null) {
      imports.push(
        t.importSpecifier(flagImport, t.identifier('shouldDeferAwait')),
      );
    }
    program.unshiftContainer(
      'body',
      t.importDeclaration(imports, t.stringLiteral(config.runtime!)),
    );
    program.node.directives.push(t.directive(t.directiveLiteral(MARKER)));
    program.scope.crawl();
  };
}
