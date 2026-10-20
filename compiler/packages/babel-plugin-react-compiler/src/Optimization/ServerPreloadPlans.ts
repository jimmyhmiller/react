/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {NodePath} from '@babel/core';
import type {Binding, Scope} from '@babel/traverse';
import * as t from '@babel/types';
import {CompilerError} from '../CompilerError';
import {
  analyzeServerPreloadPlans,
  serverPreloadCriticalPaths,
  PreloadPlanSource,
} from '../Server/ServerPreloadAnalysis';
import type {CompilerPass} from '../Entrypoint/Program';
import type {ParsedServerPreloadsOptions} from './ServerPreloads';

import {
  ServerPreloadData as Data,
  ServerPreloadValueProof,
  joinServerPreloadData,
  serverPreloadLiteral,
  immutableModuleRecord,
  nativeServerReadMethods,
} from './ServerPreloadEffects';
type Value = ServerPreloadValueProof & {
  code: t.Expression;
  data: Data;
  at: number;
  stable?: boolean | undefined;
  props?: boolean | undefined;
};
type Environment = Map<Binding, Value>;
type Fn = NodePath<
  t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
>;
type Info = {
  fn: Fn;
  name: string;
  binding: Binding | null;
  component: boolean;
  params: Array<{
    binding: Binding | null;
    name: string;
    id: t.Identifier;
    fallback?: t.Expression;
    proof?: ServerPreloadValueProof;
  }>;
  specialization?: string;
  wholeProps: Binding | null;
  id: t.Identifier;
  valid: boolean;
  state: 'unvisited' | 'building' | 'built';
  plan: Plan | null;
};
type Plan = {
  body: Array<t.Statement>;
  work: boolean;
  complete: boolean;
  returns: boolean;
  mayReturn: boolean;
  result: Data;
  consumed: number;
};
type Callable = {
  id: t.Identifier;
  result: Data;
  resource: boolean;
  complete: boolean;
  props: Array<string>;
  component: boolean;
};
type Resource = {result: Data};
type Imported = ParsedServerPreloadsOptions['components'][number];

const MARKER = 'use react server preloads';

function literal(
  node: t.Node,
): node is
  | t.StringLiteral
  | t.NumericLiteral
  | t.BooleanLiteral
  | t.NullLiteral
  | t.BigIntLiteral {
  return (
    t.isStringLiteral(node) ||
    t.isNumericLiteral(node) ||
    t.isBooleanLiteral(node) ||
    t.isNullLiteral(node) ||
    t.isBigIntLiteral(node)
  );
}
function property(
  node: t.MemberExpression | t.OptionalMemberExpression | t.ObjectProperty,
): string | null {
  if (
    !node.computed &&
    t.isIdentifier(node.type === 'ObjectProperty' ? node.key : node.property)
  ) {
    const key = node.type === 'ObjectProperty' ? node.key : node.property;
    return (key as t.Identifier).name;
  }
  const key = node.type === 'ObjectProperty' ? node.key : node.property;
  return t.isStringLiteral(key) || t.isNumericLiteral(key)
    ? String(key.value)
    : null;
}
function disabled(directives: Array<t.Directive>, pass: CompilerPass): boolean {
  return directives.some(
    ({value: {value}}) =>
      value === 'use client' ||
      value === 'use server' ||
      (!pass.opts.ignoreUseNoForget &&
        (value === 'use no memo' ||
          value === 'use no forget' ||
          pass.opts.customOptOutDirectives?.includes(value) === true)),
  );
}

/**
 * Extracts a proof-limited program of reads and immutable computations. Unknown
 * effects truncate the plan, not the original function. Plans never render JSX.
 */
export function compileServerPreloadPlans(
  program: NodePath<t.Program>,
  pass: CompilerPass,
): void {
  const config = pass.opts.serverPreloads!;
  const runtimeModule = config.runtime!;
  const emit =
    !pass.opts.noEmit &&
    config.mode === 'compile' &&
    (config.features.preloading || config.features.routeManifests);
  const report = (
    node: t.Node,
    fn: Fn | null,
    action: 'preload' | 'retain' | 'skip',
    reason: string,
  ): void => {
    pass.opts.logger?.logEvent(pass.filename, {
      kind: 'ServerPreload',
      fnLoc: fn?.node.loc ?? null,
      loc: node.loc ?? null,
      action,
      reason,
    });
  };
  if (pass.opts.gating != null || pass.opts.dynamicGating != null) {
    CompilerError.throwInvalidConfig({
      reason: 'Server preloads do not support memoization gating',
      description: 'Use a separate server compiler configuration.',
      suggestions: null,
      loc: null,
    });
  }
  if (
    disabled(program.node.directives, pass) ||
    program.node.directives.some(d => d.value.value === MARKER)
  ) {
    report(
      program.node,
      null,
      'skip',
      'Module directive excludes server preloading or plans are already compiled',
    );
    return;
  }
  const resourceBindings = new Map<Binding, Resource>();
  const importedBindings = new Map<Binding, Imported>();
  const reactContainers = new Set<Binding>();
  const reactNamespaces = new Set<Binding>();
  const reactCaches = new Set<Binding>();
  for (const stmt of program.get('body')) {
    if (
      !stmt.isImportDeclaration() ||
      (stmt.node.importKind != null && stmt.node.importKind !== 'value')
    ) {
      continue;
    }
    for (const spec of stmt.node.specifiers) {
      const binding = program.scope.getBinding(spec.local.name);
      if (binding === undefined || !binding.constant) {
        continue;
      }
      if (t.isImportNamespaceSpecifier(spec)) {
        if (stmt.node.source.value === 'react') {
          reactNamespaces.add(binding);
        }
        continue;
      }
      if (
        t.isImportSpecifier(spec) &&
        spec.importKind != null &&
        spec.importKind !== 'value'
      ) {
        continue;
      }
      const imported = t.isImportDefaultSpecifier(spec)
        ? 'default'
        : t.isIdentifier(spec.imported)
          ? spec.imported.name
          : spec.imported.value;
      const source = stmt.node.source.value;
      const resource = config.resources.find(
        r => r.source === source && r.importSpecifierName === imported,
      );
      if (resource !== undefined) {
        resourceBindings.set(binding, resource);
      }
      const component = config.components.find(
        c => c.source === source && c.importSpecifierName === imported,
      );
      if (component !== undefined) {
        importedBindings.set(binding, component);
      }
      if (source === 'react') {
        if (imported === 'cache') reactCaches.add(binding);
        if (imported === 'Suspense' || imported === 'Fragment') {
          reactContainers.add(binding);
        }
        if (imported === 'default') {
          reactNamespaces.add(binding);
        }
      }
    }
  }
  for (const resource of config.localResources) {
    const binding = program.scope.getBinding(resource.name);
    if (
      resource.name === 'default' &&
      binding === undefined &&
      program.node.body.some(node => t.isExportDefaultDeclaration(node))
    ) {
      continue;
    }
    if (binding === undefined || !binding.constant) {
      CompilerError.throwInvalidConfig({
        reason: 'Local resources require a stable module binding',
        description: resource.name,
        suggestions: null,
        loc: null,
      });
    }
    const previous = resourceBindings.get(binding);
    if (previous !== undefined && previous.result !== resource.result) {
      CompilerError.throwInvalidConfig({
        reason: 'Conflicting server resource result contracts',
        description: resource.name,
        suggestions: null,
        loc: null,
      });
    }
    resourceBindings.set(binding, resource);
  }
  const planId = (info: Info): string =>
    `${pass.filename ?? '<server>'}:${info.name}@${info.fn.node.start ?? info.fn.node.loc?.start.line ?? 0}${info.specialization ?? ''}`;
  const locations = new Map<string, t.SourceLocation | null>();
  const managedReads = new Set<string>();
  const readLabel = (
    info: Info,
    target: t.Identifier,
    node: t.Node,
  ): string => {
    const label = `${pass.filename ?? '<server>'}:${info.name}:${target.name}:${node.loc?.start.line ?? 0}:${node.loc?.start.column ?? node.start ?? 0}`;
    locations.set(label, node.loc ?? null);
    return label;
  };
  const segments: Array<PreloadPlanSource> = [];
  const readCalls: Array<t.CallExpression> = [];
  const runtimeNames = new Map<string, t.Identifier>();
  const useRuntime = (
    name: string,
    args: Array<t.Expression>,
  ): t.CallExpression => {
    let id = runtimeNames.get(name);
    if (id === undefined) {
      id = program.scope.generateUidIdentifier('preload_' + name);
      runtimeNames.set(name, id);
    }
    const call = t.callExpression(t.cloneNode(id), args);
    if (name === 'read') {
      readCalls.push(call);
    }
    return call;
  };
  const importedPlans = new Map<Binding, t.Identifier>();
  const importedDataPlans = new Map<Binding, t.Identifier>();
  const infos = new Map<Binding, Info>();
  const anonymousInfos: Array<Info> = [];
  const normalized = new Map<
    NodePath<t.ArrowFunctionExpression>,
    t.Expression
  >();
  const functionPaths = new WeakMap<t.Node, Fn>();
  program.traverse({
    Function(path) {
      if (
        path.isFunctionDeclaration() ||
        path.isFunctionExpression() ||
        path.isArrowFunctionExpression()
      )
        functionPaths.set(path.node, path as Fn);
    },
  });
  const variants: Array<Info> = [];
  const specializations = new Map<Info, Map<string, Info>>();
  program.traverse({
    Function(path) {
      if (
        !path.isFunctionDeclaration() &&
        !path.isFunctionExpression() &&
        !path.isArrowFunctionExpression()
      ) {
        path.skip();
        return;
      }
      const wrapper =
        path.parentPath.isCallExpression() &&
        path.parentPath.node.arguments[0] === path.node &&
        path.parentPath.parentPath.isVariableDeclarator()
          ? path.parentPath
          : null;
      const cacheBinding =
        wrapper !== null && t.isIdentifier(wrapper.node.callee)
          ? wrapper.scope.getBinding(wrapper.node.callee.name)
          : undefined;
      const cached =
        wrapper !== null &&
        ((cacheBinding !== undefined && reactCaches.has(cacheBinding)) ||
          (t.isMemberExpression(wrapper.node.callee) &&
            !wrapper.node.callee.computed &&
            t.isIdentifier(wrapper.node.callee.object) &&
            t.isIdentifier(wrapper.node.callee.property, {name: 'cache'}) &&
            reactNamespaces.has(
              wrapper.scope.getBinding(wrapper.node.callee.object.name)!,
            )));
      const cachedName =
        cached &&
        t.isIdentifier((wrapper!.parentPath.node as t.VariableDeclarator).id)
          ? (
              (wrapper!.parentPath.node as t.VariableDeclarator)
                .id as t.Identifier
            ).name
          : null;
      const name =
        cachedName ??
        (path.isFunctionDeclaration() && path.node.id != null
          ? path.node.id.name
          : path.parentPath.isVariableDeclarator() &&
              t.isIdentifier(path.parentPath.node.id)
            ? path.parentPath.node.id.name
            : path.parentPath.isExportDefaultDeclaration()
              ? 'default'
              : null);
      if (
        name != null &&
        path.isArrowFunctionExpression() &&
        !t.isBlockStatement(path.node.body)
      ) {
        normalized.set(path, path.node.body);
        path
          .get('body')
          .replaceWith(t.blockStatement([t.returnStatement(path.node.body)]));
      }
      if (
        name != null &&
        t.isBlockStatement(path.node.body) &&
        !path.node.generator &&
        !disabled(path.node.body.directives, pass)
      ) {
        const binding =
          name === 'default' ? null : program.scope.getBinding(name);
        if (
          (binding === null &&
            !config.localResources.some(
              resource => resource.name === 'default',
            )) ||
          (binding !== undefined &&
            binding !== null &&
            binding.constant &&
            !resourceBindings.has(binding) &&
            (binding.path === path ||
              binding.path === path.parentPath ||
              (cached && binding.path === wrapper?.parentPath)))
        ) {
          const annotated = path.node.body.directives.some(
            d => d.value.value === 'use memo' || d.value.value === 'use forget',
          );
          const component = name === 'default' || /^[A-Z]/.test(name);
          const selected =
            pass.opts.compilationMode === 'all' ||
            (pass.opts.compilationMode === 'annotation'
              ? annotated
              : pass.opts.compilationMode !== 'syntax');
          if (selected) {
            const info: Info = {
              fn: path,
              name,
              binding,
              component,
              params: [],
              wholeProps: null,
              id: program.scope.generateUidIdentifier('preload' + name),
              valid: true,
              state: 'unvisited',
              plan: null,
            };
            if (
              component &&
              path.node.params.length === 1 &&
              t.isObjectPattern(path.node.params[0])
            ) {
              for (const prop of path.node.params[0].properties) {
                if (
                  !t.isObjectProperty(prop) ||
                  prop.computed ||
                  !(
                    t.isIdentifier(prop.value) ||
                    (t.isAssignmentPattern(prop.value) &&
                      t.isIdentifier(prop.value.left) &&
                      serverPreloadLiteral(prop.value.right))
                  ) ||
                  (!t.isIdentifier(prop.key) && !t.isStringLiteral(prop.key))
                ) {
                  report(
                    prop,
                    path as Fn,
                    'retain',
                    'Component parameter needs a static property with a constant binding and a literal-only default',
                  );
                  info.valid = false;
                  break;
                }
                const value = t.isAssignmentPattern(prop.value)
                  ? (prop.value.left as t.Identifier)
                  : (prop.value as t.Identifier);
                const paramBinding = path.scope.getBinding(value.name);
                if (paramBinding === undefined || !paramBinding.constant) {
                  info.valid = false;
                  break;
                }
                const key = t.isIdentifier(prop.key)
                  ? prop.key.name
                  : prop.key.value;
                info.params.push({
                  binding: paramBinding,
                  ...(t.isAssignmentPattern(prop.value)
                    ? {
                        fallback: t.cloneNode(
                          prop.value.right as t.Expression,
                          true,
                        ),
                      }
                    : {}),
                  name: key,
                  id: program.scope.generateUidIdentifier('p_' + key),
                });
              }
            } else if (
              component &&
              path.node.params.length === 1 &&
              t.isIdentifier(path.node.params[0])
            ) {
              info.wholeProps =
                path.scope.getBinding(path.node.params[0].name) ?? null;
              const properties = new Set<string>();
              path.traverse({
                Function(nested) {
                  nested.skip();
                },
                MemberExpression(member) {
                  if (
                    t.isIdentifier(member.node.object) &&
                    member.scope.getBinding(member.node.object.name) ===
                      info.wholeProps
                  ) {
                    const key = property(member.node);
                    if (key !== null) {
                      properties.add(key);
                    }
                  }
                },
              });
              for (const key of properties) {
                info.params.push({
                  binding: null,
                  name: key,
                  id: program.scope.generateUidIdentifier('p_' + key),
                });
              }
            } else {
              for (const param of path.node.params) {
                if (!t.isIdentifier(param)) {
                  info.valid = false;
                  break;
                }
                const paramBinding = path.scope.getBinding(param.name);
                if (paramBinding === undefined || !paramBinding.constant) {
                  info.valid = false;
                  break;
                }
                info.params.push({
                  binding: paramBinding,
                  name: param.name,
                  id: program.scope.generateUidIdentifier('p_' + param.name),
                });
              }
            }
            if (binding === null) {
              anonymousInfos.push(info);
            } else {
              infos.set(binding, info);
            }
          }
        }
      }
      path.skip();
    },
  });

  const specialize = (
    original: Info,
    proofs: Array<ServerPreloadValueProof>,
  ): Info => {
    if (proofs.every(proof => proof.data === 'unknown')) return original;
    const key = proofs.map(p => p.data + (p.stable ? ':stable' : '')).join(',');
    let entries = specializations.get(original);
    if (entries === undefined) {
      entries = new Map();
      specializations.set(original, entries);
    }
    const previous = entries.get(key);
    if (previous !== undefined) return previous;
    /*
     * A finite proof-domain and bounded variants keep recursive specialization
     * from expanding the compiler indefinitely. Falling back loses only work.
     */
    if (variants.length >= 64) return original;
    const info: Info = {
      ...original,
      id: program.scope.generateUidIdentifier(
        'preload' + original.name + 'Data',
      ),
      specialization: ':proof(' + key + ')',
      params: original.params.map((param, index) => ({
        ...param,
        proof: proofs[index] ?? {data: 'unknown'},
      })),
      state: 'unvisited',
      plan: null,
    };
    entries.set(key, info);
    variants.push(info);
    return info;
  };
  const callable = (
    node: t.Node,
    scope: Scope,
    proofs?: Array<ServerPreloadValueProof>,
  ): Callable | null => {
    if (!t.isIdentifier(node)) {
      return null;
    }
    const binding = scope.getBinding(node.name);
    if (binding === undefined) {
      return null;
    }
    const resource = resourceBindings.get(binding);
    if (resource !== undefined) {
      return {
        id: t.identifier(binding.identifier.name),
        result: resource.result,
        resource: true,
        complete: true,
        props: [],
        component: false,
      };
    }
    const original = infos.get(binding);
    const local =
      original !== undefined && proofs !== undefined
        ? specialize(original, proofs)
        : original;
    if (local !== undefined && local.valid) {
      const plan = build(local);
      if (plan?.work || (plan?.complete && !local.component)) {
        return {
          id: local.id,
          result: plan.result,
          resource: false,
          complete: plan.complete,
          props: local.params.map(p => p.name),
          component: local.component,
        };
      }
      return null;
    }
    const imported = importedBindings.get(binding);
    if (imported !== undefined) {
      const known =
        proofs !== undefined &&
        imported.props.every(
          (_, index) =>
            proofs[index] !== undefined &&
            proofs[index].data !== 'unknown' &&
            proofs[index].pending === undefined &&
            (proofs[index].stable === true ||
              proofs[index].data === 'primitive'),
        );
      if (imported.requiresData && !known) return null;
      const selected =
        known && imported.dataPreload !== undefined
          ? imported.dataPreload
          : imported;
      const table = selected === imported ? importedPlans : importedDataPlans;
      let id = table.get(binding);
      if (id === undefined) {
        id = program.scope.generateUidIdentifier(selected.preload);
        table.set(binding, id);
      }
      return {
        id,
        result: selected.result,
        resource: false,
        complete: selected.complete,
        props: imported.props,
        component: imported.functionKind === 'component',
      };
    }
    return null;
  };

  const inlining = new Set<Binding>();
  const expression = (
    node: t.Node,
    scope: Scope,
    env: Environment,
    info: Info,
  ): Value | null => {
    if (literal(node)) {
      return {code: t.cloneNode(node), data: 'primitive', at: 0, stable: true};
    }
    if (t.isIdentifier(node)) {
      if (
        node.name === 'undefined' &&
        scope.getBinding(node.name) === undefined
      ) {
        return {
          code: t.unaryExpression('void', t.numericLiteral(0)),
          data: 'primitive',
          at: 0,
          stable: true,
        };
      }
      const binding = scope.getBinding(node.name);
      if (binding === undefined) {
        return null;
      }
      const value = env.get(binding);
      if (value !== undefined) {
        return value;
      }
      if (
        binding.constant &&
        binding.scope === program.scope &&
        binding.path.isVariableDeclarator() &&
        literal(binding.path.node.init ?? t.emptyStatement())
      ) {
        return {
          code: t.cloneNode(binding.path.node.init as t.Expression),
          data: 'primitive',
          at: 0,
          stable: true,
        };
      }
      if (immutableModuleRecord(binding)) {
        return {
          code: t.identifier(binding.identifier.name),
          data: 'immutable-data',
          at: 0,
          stable: true,
        };
      }
      if (
        binding.constant &&
        binding.kind === 'const' &&
        binding.scope === program.scope
      )
        return {
          code: t.identifier(binding.identifier.name),
          data: 'unknown',
          at: 0,
        };
      return null;
    }
    if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) {
      const key = property(node as t.MemberExpression);
      const computed =
        node.computed && t.isExpression(node.property)
          ? expression(node.property, scope, env, info)
          : null;
      if (
        (key === null &&
          (computed === null || computed.data !== 'primitive')) ||
        !t.isExpression(node.object)
      ) {
        return null;
      }
      if (
        t.isIdentifier(node.object) &&
        info.wholeProps !== null &&
        scope.getBinding(node.object.name) === info.wholeProps
      ) {
        if (env.get(info.wholeProps)?.props !== true) {
          return null;
        }
        const param = info.params.find(p => p.name === key);
        if (param !== undefined) {
          const original = env.get(info.wholeProps)?.code;
          return {
            code:
              original !== undefined && t.isIdentifier(original)
                ? t.memberExpression(
                    t.cloneNode(original),
                    t.stringLiteral(key!),
                    true,
                  )
                : t.cloneNode(param.id),
            data: 'unknown',
            at: 0,
          };
        }
      }
      const object = expression(node.object, scope, env, info);
      if (
        object === null ||
        (object.data !== 'immutable-data' && object.data !== 'array')
      ) {
        return null;
      }
      return {
        code: t.isOptionalMemberExpression(node)
          ? t.optionalMemberExpression(
              t.cloneNode(object.code, true),
              key === null
                ? t.cloneNode(computed!.code, true)
                : t.stringLiteral(key),
              true,
              node.optional,
            )
          : t.memberExpression(
              t.cloneNode(object.code, true),
              key === null
                ? t.cloneNode(computed!.code, true)
                : t.stringLiteral(key),
              true,
            ),
        data:
          object.data === 'array' && key === 'length'
            ? 'primitive'
            : 'immutable-data',
        at: Math.max(object.at, computed?.at ?? 0),
        work: object.work || computed?.work,
        stable: object.stable,
      };
    }
    if (
      t.isUnaryExpression(node) &&
      (node.operator === '!' ||
        node.operator === 'typeof' ||
        node.operator === 'void' ||
        node.operator === '+' ||
        node.operator === '-')
    ) {
      const value = expression(node.argument, scope, env, info);
      if (
        value === null ||
        ((node.operator === '+' || node.operator === '-') &&
          value.data === 'unknown')
      ) {
        return null;
      }
      return {
        code: t.unaryExpression(node.operator, t.cloneNode(value.code, true)),
        data: 'primitive',
        at: value.at,
        work: value.work,
        stable: true,
      };
    }
    if (t.isBinaryExpression(node) || t.isLogicalExpression(node)) {
      if (!t.isExpression(node.left)) {
        return null;
      }
      const left = expression(node.left, scope, env, info);
      const right = expression(node.right, scope, env, info);
      if (left === null || right === null) {
        return null;
      }
      if (
        t.isBinaryExpression(node) &&
        node.operator !== '===' &&
        node.operator !== '!==' &&
        (left.data === 'unknown' || right.data === 'unknown')
      ) {
        return null;
      }
      if (
        t.isBinaryExpression(node) &&
        (node.operator === 'in' || node.operator === 'instanceof')
      ) {
        return null;
      }
      return {
        code: t.isBinaryExpression(node)
          ? t.binaryExpression(
              node.operator,
              t.cloneNode(left.code, true),
              t.cloneNode(right.code, true),
            )
          : t.logicalExpression(
              node.operator,
              t.cloneNode(left.code, true),
              t.cloneNode(right.code, true),
            ),
        data: t.isBinaryExpression(node)
          ? 'primitive'
          : joinServerPreloadData(left.data, right.data),
        at: Math.max(left.at, right.at),
        work: left.work || right.work,
        stable: left.stable === true && right.stable === true,
      };
    }
    if (t.isConditionalExpression(node)) {
      const test = expression(node.test, scope, env, info);
      const yes = expression(node.consequent, scope, env, info);
      const no = expression(node.alternate, scope, env, info);
      if (test === null || yes === null || no === null) {
        return null;
      }
      return {
        code: t.conditionalExpression(
          t.cloneNode(test.code, true),
          t.cloneNode(yes.code, true),
          t.cloneNode(no.code, true),
        ),
        data: joinServerPreloadData(yes.data, no.data),
        at: Math.max(test.at, yes.at, no.at),
        work: test.work || yes.work || no.work,
        stable: yes.stable === true && no.stable === true,
      };
    }
    if (t.isAwaitExpression(node)) {
      const value = expression(node.argument, scope, env, info);
      if (value?.pending === undefined || value.pending === 'unknown')
        return null;
      return {
        ...value,
        code: t.awaitExpression(t.cloneNode(value.code, true)),
        data: value.pending,
        pending: undefined,
        stable: value.resolvedStable,
      };
    }
    if (t.isTemplateLiteral(node)) {
      const values = node.expressions.map(n => expression(n, scope, env, info));
      if (
        values.some(
          v => v === null || v.data === 'unknown' || v.pending !== undefined,
        )
      )
        return null;
      return {
        code: t.templateLiteral(
          node.quasis.map(n => t.cloneNode(n)),
          values.map(v => t.cloneNode(v!.code, true)),
        ),
        data: 'primitive',
        at: Math.max(0, ...values.map(v => v!.at)),
        work: values.some(v => v!.work),
      };
    }
    if (t.isArrayExpression(node)) {
      const values: Array<Value | null> = [];
      for (const element of node.elements) {
        if (element === null) {
          values.push(null);
          continue;
        }
        if (!t.isExpression(element)) return null;
        const value = expression(element, scope, env, info);
        if (value === null) return null;
        values.push(value);
      }
      const present = values.filter((v): v is Value => v !== null);
      const promises =
        present.length > 0 &&
        present.every(v => v.pending !== undefined && v.pending !== 'unknown');
      return {
        code: t.arrayExpression(
          values.map(v => (v === null ? null : t.cloneNode(v.code, true))),
        ),
        data: present.every(v => v.data !== 'unknown') ? 'array' : 'unknown',
        sequence: promises
          ? {
              element: present.reduce<Data>(
                (d, v) => joinServerPreloadData(d, v.pending!),
                present[0].pending!,
              ),
              pending: true,
            }
          : undefined,
        at: Math.max(0, ...present.map(v => v.at)),
        work: present.some(v => v.work),
      };
    }
    if (t.isObjectExpression(node)) {
      const properties: Array<t.ObjectProperty | t.SpreadElement> = [];
      const values: Array<Value> = [];
      for (const prop of node.properties) {
        if (t.isSpreadElement(prop)) {
          const value = expression(prop.argument, scope, env, info);
          if (
            value === null ||
            value.data === 'unknown' ||
            value.pending !== undefined
          )
            return null;
          properties.push(t.spreadElement(t.cloneNode(value.code, true)));
          values.push(value);
          continue;
        }
        if (
          !t.isObjectProperty(prop) ||
          prop.computed ||
          !t.isExpression(prop.value) ||
          !(
            t.isIdentifier(prop.key) ||
            t.isStringLiteral(prop.key) ||
            t.isNumericLiteral(prop.key)
          )
        )
          return null;
        const value = expression(prop.value, scope, env, info);
        if (value === null) return null;
        const proto = property(prop) === '__proto__';
        if (proto && !prop.shorthand) return null;
        // Define an ordinary own property; never invoke the __proto__ setter.
        properties.push(
          t.objectProperty(
            proto ? t.stringLiteral('__proto__') : t.cloneNode(prop.key),
            t.cloneNode(value.code, true),
            proto,
          ),
        );
        values.push(value);
      }
      return {
        code: t.objectExpression(properties),
        data: values.every(v => v.data !== 'unknown' && v.pending === undefined)
          ? 'immutable-data'
          : 'unknown',
        at: Math.max(0, ...values.map(v => v.at)),
        work: values.some(v => v.work),
      };
    }
    if (
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      !node.callee.computed &&
      t.isIdentifier(node.callee.property)
    ) {
      const method = node.callee.property.name;
      if (
        t.isIdentifier(node.callee.object, {name: 'Promise'}) &&
        scope.getBinding('Promise') === undefined &&
        method === 'all' &&
        node.arguments.length === 1 &&
        t.isExpression(node.arguments[0])
      ) {
        const input = expression(node.arguments[0], scope, env, info);
        if (
          input !== null &&
          (input.sequence?.pending === true || input.data === 'array')
        ) {
          const code = useRuntime('fork', [
            t.arrowFunctionExpression(
              [],
              t.callExpression(
                t.memberExpression(
                  t.identifier('Promise'),
                  t.identifier('all'),
                ),
                [t.cloneNode(input.code, true)],
              ),
            ),
          ]);
          return {
            code,
            data: 'unknown',
            pending: 'array',
            at: input.at,
            work: input.work,
          };
        }
        return null;
      }
      const receiver = expression(node.callee.object, scope, env, info);
      if (
        receiver === null ||
        receiver.data === 'unknown' ||
        receiver.pending !== undefined
      )
        return null;
      if (
        [
          'map',
          'filter',
          'flatMap',
          'reduce',
          'some',
          'every',
          'find',
          'findIndex',
        ].includes(method)
      ) {
        if (
          receiver.data === 'primitive' ||
          node.arguments.length !== (method === 'reduce' ? 2 : 1)
        )
          return null;
        const initial =
          method === 'reduce' && t.isExpression(node.arguments[1])
            ? expression(node.arguments[1], scope, env, info)
            : null;
        if (
          method === 'reduce' &&
          (initial === null || initial.data === 'unknown')
        )
          return null;
        const item: ServerPreloadValueProof = {
          data: 'immutable-data',
          stable: receiver.stable,
        };
        const proofs =
          method === 'reduce'
            ? [
                initial!,
                item,
                {data: 'primitive'} as const,
                {data: 'array', stable: receiver.stable} as const,
              ]
            : [
                item,
                {data: 'primitive'} as const,
                {data: 'array', stable: receiver.stable} as const,
              ];
        const callback = callbackPlan(
          node.arguments[0],
          scope,
          env,
          info,
          proofs,
          false,
        );
        if (
          callback === null ||
          (method !== 'map' && (callback.pending || callback.work)) ||
          (method === 'reduce' && callback.data !== initial!.data)
        )
          return null;
        const data: Data =
          method === 'map' && callback.pending
            ? 'unknown'
            : ['map', 'filter', 'flatMap'].includes(method)
              ? 'array'
              : method === 'reduce'
                ? initial!.data
                : method === 'find'
                  ? 'immutable-data'
                  : 'primitive';
        return {
          code: t.callExpression(
            t.memberExpression(
              t.cloneNode(receiver.code, true),
              t.identifier(method),
            ),
            [
              callback.code,
              ...(initial === null ? [] : [t.cloneNode(initial.code, true)]),
            ],
          ),
          data,
          sequence:
            method === 'map'
              ? {element: callback.data, pending: callback.pending}
              : undefined,
          at: Math.max(receiver.at, callback.at, initial?.at ?? 0),
          work: receiver.work || callback.work || initial?.work,
        };
      }
      const result = nativeServerReadMethods.get(method);
      if (result === undefined) return null;
      const args = argumentsFor(node, scope, env, info);
      if (
        args === null ||
        args.some(arg => arg.data === 'unknown' || arg.pending !== undefined)
      )
        return null;
      return {
        code: t.callExpression(
          t.memberExpression(
            t.cloneNode(receiver.code, true),
            t.identifier(method),
          ),
          args.map(arg => t.cloneNode(arg.code, true)),
        ),
        data: result,
        at: Math.max(receiver.at, ...args.map(arg => arg.at)),
        work: receiver.work || args.some(arg => arg.work),
      };
    }
    if (t.isCallExpression(node) && t.isIdentifier(node.callee)) {
      const binding = scope.getBinding(node.callee.name);
      const helper = binding === undefined ? undefined : infos.get(binding);
      if (
        binding !== undefined &&
        helper !== undefined &&
        helper.valid &&
        !helper.component &&
        !helper.fn.node.async &&
        !inlining.has(binding) &&
        t.isBlockStatement(helper.fn.node.body)
      ) {
        const values: Array<Value> = [];
        for (const arg of node.arguments) {
          if (!t.isExpression(arg)) {
            return null;
          }
          const value = expression(arg, scope, env, info);
          if (value === null) {
            return null;
          }
          values.push(value);
        }
        if (values.length !== helper.params.length) {
          return null;
        }
        const local = new Map<Binding, Value>();
        helper.params.forEach((param, index) => {
          if (param.binding !== null) {
            local.set(param.binding, values[index]);
          }
        });
        inlining.add(binding);
        try {
          for (const statement of helper.fn.node.body.body) {
            if (
              t.isVariableDeclaration(statement, {kind: 'const'}) &&
              statement.declarations.length === 1 &&
              t.isIdentifier(statement.declarations[0].id) &&
              statement.declarations[0].init != null
            ) {
              const declaration = statement.declarations[0];
              const key = helper.fn.scope.getBinding(
                (declaration.id as t.Identifier).name,
              );
              const value = expression(
                declaration.init!,
                helper.fn.scope,
                local,
                helper,
              );
              if (key === undefined || !key.constant || value === null) {
                return null;
              }
              local.set(key, value);
            } else if (
              t.isReturnStatement(statement) &&
              statement.argument != null
            ) {
              return expression(
                statement.argument,
                helper.fn.scope,
                local,
                helper,
              );
            } else {
              return null;
            }
          }
        } finally {
          inlining.delete(binding);
        }
      }
    }
    if (
      t.isCallExpression(node) &&
      t.isIdentifier(node.callee) &&
      [
        'Boolean',
        'String',
        'Number',
        'encodeURI',
        'encodeURIComponent',
      ].includes(node.callee.name) &&
      scope.getBinding(node.callee.name) === undefined
    ) {
      const args = argumentsFor(node, scope, env, info);
      if (
        args !== null &&
        args.every(arg => arg.data !== 'unknown' && arg.pending === undefined)
      )
        return {
          code: t.callExpression(
            t.cloneNode(node.callee),
            args.map(arg => t.cloneNode(arg.code, true)),
          ),
          data: 'primitive',
          at: Math.max(0, ...args.map(arg => arg.at)),
          work: args.some(arg => arg.work),
        };
    }
    if (t.isCallExpression(node)) {
      const args = argumentsFor(node, scope, env, info);
      const target = args === null ? null : callable(node.callee, scope, args);
      if (
        target !== null &&
        args !== null &&
        !target.component &&
        target.complete &&
        target.result !== 'unknown'
      ) {
        const call = target.resource
          ? t.memberExpression(
              t.awaitExpression(
                useRuntime('read', [
                  t.cloneNode(target.id),
                  t.arrayExpression(
                    args.map(arg => t.cloneNode(arg.code, true)),
                  ),
                  t.stringLiteral(readLabel(info, target.id, node)),
                ]),
              ),
              t.identifier('value'),
            )
          : t.awaitExpression(
              t.callExpression(
                t.cloneNode(target.id),
                args.map(arg => t.cloneNode(arg.code, true)),
              ),
            );
        return {
          code: useRuntime('fork', [t.arrowFunctionExpression([], call, true)]),
          data: 'unknown',
          pending: target.result,
          resolvedStable: target.resource,
          at: Math.max(0, ...args.map(arg => arg.at)),
          work: true,
        };
      }
    }
    if (
      t.isTSAsExpression(node) ||
      t.isTSTypeAssertion(node) ||
      t.isTSNonNullExpression(node) ||
      t.isTypeCastExpression(node)
    ) {
      return expression(node.expression, scope, env, info);
    }
    return null;
  };

  const callbackPlan = (
    node: t.Node | undefined | null,
    scope: Scope,
    env: Environment,
    owner: Info,
    proofs: Array<ServerPreloadValueProof>,
    jsx: boolean,
  ): {
    code: t.ArrowFunctionExpression;
    data: Data;
    pending: boolean;
    work: boolean;
    at: number;
  } | null => {
    if (
      t.isIdentifier(node, {name: 'Boolean'}) &&
      scope.getBinding('Boolean') === undefined
    ) {
      const id = program.scope.generateUidIdentifier('value');
      return {
        code: t.arrowFunctionExpression(
          [id],
          t.blockStatement([
            t.expressionStatement(useRuntime('checkStep', [])),
            t.returnStatement(
              t.unaryExpression('!', t.unaryExpression('!', t.cloneNode(id))),
            ),
          ]),
        ),
        data: 'primitive',
        pending: false,
        work: false,
        at: 0,
      };
    }
    if (
      node == null ||
      !(t.isArrowFunctionExpression(node) || t.isFunctionExpression(node))
    )
      return null;
    const fn = functionPaths.get(node);
    if (
      fn === undefined ||
      node.generator ||
      node.params.length > proofs.length
    )
      return null;
    if (
      t.isArrowFunctionExpression(fn.node) &&
      !t.isBlockStatement(fn.node.body)
    ) {
      normalized.set(fn as NodePath<t.ArrowFunctionExpression>, fn.node.body);
      fn.get('body').replaceWith(
        t.blockStatement([t.returnStatement(fn.node.body)]),
      );
    }
    const params: Array<t.Identifier> = [];
    const local = new Map(
      Array.from(env, ([binding, value]) => [binding, {...value, at: 0}]),
    );
    for (let index = 0; index < node.params.length; index++) {
      const param = node.params[index],
        id = program.scope.generateUidIdentifier('item');
      params.push(id);
      const proof = proofs[index];
      if (t.isIdentifier(param)) {
        const binding = fn.scope.getBinding(param.name);
        if (binding === undefined || !binding.constant) return null;
        local.set(binding, {...proof, code: id, at: 0});
      } else if (
        t.isObjectPattern(param) &&
        proof.data !== 'unknown' &&
        proof.data !== 'primitive'
      ) {
        for (const prop of param.properties) {
          if (
            !t.isObjectProperty(prop) ||
            prop.computed ||
            !t.isIdentifier(prop.value) ||
            (!t.isIdentifier(prop.key) && !t.isStringLiteral(prop.key))
          )
            return null;
          const binding = fn.scope.getBinding(prop.value.name);
          if (binding === undefined || !binding.constant) return null;
          const key = t.isIdentifier(prop.key) ? prop.key.name : prop.key.value;
          local.set(binding, {
            code: t.memberExpression(
              t.cloneNode(id),
              t.stringLiteral(key),
              true,
            ),
            data: 'immutable-data',
            stable: proof.stable,
            at: 0,
          });
        }
      } else return null;
    }
    const info: Info = {
      fn,
      name: owner.name + ' callback',
      binding: null,
      component: jsx,
      params: [],
      wholeProps: null,
      id: program.scope.generateUidIdentifier('callback'),
      valid: true,
      state: 'building',
      plan: null,
    };
    const plan = planBlock(
      fn.get('body').get('body') as Array<NodePath<t.Statement>>,
      local,
      info,
    );
    if (!plan.complete || (!jsx && plan.result === 'unknown')) return null;
    let at = 0;
    fn.traverse({
      Identifier(reference) {
        if (!reference.isReferencedIdentifier()) return;
        const binding = reference.scope.getBinding(reference.node.name);
        const value = binding === undefined ? undefined : env.get(binding);
        if (value !== undefined) at = Math.max(at, value.at);
      },
    });
    const pending = node.async || plan.work;
    const body = t.blockStatement(plan.body);
    const check = t.expressionStatement(useRuntime('checkStep', []));
    const code = pending
      ? t.arrowFunctionExpression(
          params,
          t.blockStatement([
            check,
            t.returnStatement(
              useRuntime('fork', [t.arrowFunctionExpression([], body, true)]),
            ),
          ]),
        )
      : t.arrowFunctionExpression(
          params,
          t.blockStatement([check, ...body.body]),
        );
    return {code, data: plan.result, pending, work: plan.work, at};
  };

  const argumentsFor = (
    call: t.CallExpression,
    scope: Scope,
    env: Environment,
    info: Info,
  ): Array<Value> | null => {
    const args: Array<Value> = [];
    for (const arg of call.arguments) {
      if (!t.isExpression(arg)) {
        return null;
      }
      const value = expression(arg, scope, env, info);
      if (value === null) {
        return null;
      }
      args.push(value);
    }
    return args;
  };
  const container = (
    name: t.JSXElement['openingElement']['name'],
    scope: Scope,
  ): boolean => {
    if (t.isJSXIdentifier(name)) {
      const binding = scope.getBinding(name.name);
      return binding !== undefined && reactContainers.has(binding);
    }
    if (
      t.isJSXMemberExpression(name) &&
      t.isJSXIdentifier(name.object) &&
      (name.property.name === 'Suspense' || name.property.name === 'Fragment')
    ) {
      const binding = scope.getBinding(name.object.name);
      return binding !== undefined && reactNamespaces.has(binding);
    }
    return false;
  };
  const jsxMap = (
    node: t.Node,
    scope: Scope,
    env: Environment,
    info: Info,
  ): {code: t.Expression; at: number} | null => {
    if (
      !t.isCallExpression(node) ||
      !t.isMemberExpression(node.callee) ||
      node.callee.computed ||
      !t.isIdentifier(node.callee.property, {name: 'map'}) ||
      node.arguments.length !== 1
    )
      return null;
    const values = expression(node.callee.object, scope, env, info);
    if (
      values === null ||
      values.data === 'unknown' ||
      values.data === 'primitive' ||
      values.pending !== undefined
    )
      return null;
    const callback = callbackPlan(
      node.arguments[0],
      scope,
      env,
      info,
      [
        {data: 'immutable-data', stable: values.stable},
        {data: 'primitive', stable: true},
        {data: 'array', stable: values.stable},
      ],
      true,
    );
    if (callback === null) return null;
    return {
      code: t.callExpression(
        t.memberExpression(t.cloneNode(values.code, true), t.identifier('map')),
        [callback.code],
      ),
      at: Math.max(values.at, callback.at),
    };
  };
  const jsxPure = (
    node: t.Node,
    scope: Scope,
    env: Environment,
    info: Info,
  ): boolean => {
    if (t.isJSXText(node) || t.isJSXEmptyExpression(node)) return true;
    if (t.isJSXExpressionContainer(node))
      return jsxPure(node.expression, scope, env, info);
    if (t.isJSXFragment(node))
      return node.children.every(child => jsxPure(child, scope, env, info));
    if (t.isJSXElement(node))
      return (
        (t.isJSXIdentifier(node.openingElement.name) ||
          container(node.openingElement.name, scope)) &&
        node.openingElement.attributes.every(attr =>
          t.isJSXSpreadAttribute(attr)
            ? ((): boolean => {
                const value = expression(attr.argument, scope, env, info);
                return (
                  value !== null &&
                  value.data !== 'unknown' &&
                  value.pending === undefined
                );
              })()
            : t.isJSXIdentifier(attr.name) &&
              (attr.value == null ||
                t.isStringLiteral(attr.value) ||
                jsxPure(attr.value, scope, env, info)),
        ) &&
        node.children.every(child => jsxPure(child, scope, env, info))
      );
    if (t.isLogicalExpression(node))
      return (
        expression(node.left, scope, env, info) !== null &&
        jsxPure(node.right, scope, env, info)
      );
    if (t.isConditionalExpression(node))
      return (
        expression(node.test, scope, env, info) !== null &&
        jsxPure(node.consequent, scope, env, info) &&
        jsxPure(node.alternate, scope, env, info)
      );
    if (t.isArrayExpression(node))
      return node.elements.every(
        child => child === null || jsxPure(child, scope, env, info),
      );
    if (jsxMap(node, scope, env, info) !== null) return true;
    /*
     * Loading a stable binding is pure even when its object shape is unknown.
     * Property access/spread/calls still require the stronger data proof.
     */
    if (t.isIdentifier(node)) {
      const binding = scope.getBinding(node.name);
      if (binding?.constant && binding.kind !== 'module') return true;
    }
    const value = t.isExpression(node)
      ? expression(node, scope, env, info)
      : null;
    return value !== null && value.pending === undefined && value.work !== true;
  };
  type JSXGroup = {body: Array<t.Statement>; at: number};
  type JSXPlan = {
    body: Array<t.Statement>;
    at: number;
    groups: Array<JSXGroup>;
  };
  const jsxPlan = (
    node: t.Node,
    scope: Scope,
    env: Environment,
    info: Info,
  ): JSXPlan => {
    const groups: Array<JSXGroup> = [];
    const result = (): JSXPlan => ({
      groups,
      body: groups.flatMap(group => group.body),
      at: Math.max(0, ...groups.map(group => group.at)),
    });
    if (t.isJSXExpressionContainer(node))
      return jsxPlan(node.expression, scope, env, info);
    if (t.isLogicalExpression(node) || t.isConditionalExpression(node)) {
      const test = expression(
        t.isLogicalExpression(node) ? node.left : node.test,
        scope,
        env,
        info,
      )!;
      if (t.isConditionalExpression(node)) {
        const yes = jsxPlan(node.consequent, scope, env, info),
          no = jsxPlan(node.alternate, scope, env, info);
        for (const group of yes.groups)
          groups.push({
            at: Math.max(test.at, group.at),
            body: [
              t.ifStatement(
                t.cloneNode(test.code, true),
                t.blockStatement(group.body),
              ),
            ],
          });
        for (const group of no.groups)
          groups.push({
            at: Math.max(test.at, group.at),
            body: [
              t.ifStatement(
                t.unaryExpression('!', t.cloneNode(test.code, true)),
                t.blockStatement(group.body),
              ),
            ],
          });
      } else {
        const condition =
          node.operator === '&&'
            ? test.code
            : node.operator === '||'
              ? t.unaryExpression('!', test.code)
              : t.binaryExpression('==', test.code, t.nullLiteral());
        for (const group of jsxPlan(node.right, scope, env, info).groups)
          groups.push({
            at: Math.max(test.at, group.at),
            body: [
              t.ifStatement(
                t.cloneNode(condition, true),
                t.blockStatement(group.body),
              ),
            ],
          });
      }
      return result();
    }
    if (t.isJSXElement(node)) {
      if (t.isJSXIdentifier(node.openingElement.name)) {
        const tag = node.openingElement.name.name,
          binding = scope.getBinding(tag),
          local = binding === undefined ? undefined : infos.get(binding),
          imported =
            binding === undefined ? undefined : importedBindings.get(binding);
        const names =
          local?.params.map(param => param.name) ?? imported?.props ?? [];
        const props = new Map<string, Value>();
        const unavailable = new Set<string>();
        for (const attr of node.openingElement.attributes) {
          if (t.isJSXSpreadAttribute(attr)) {
            const spread = expression(attr.argument, scope, env, info)!;
            for (const name of names) {
              const previous = props.get(name) ?? {
                code: t.unaryExpression('void', t.numericLiteral(0)),
                data: 'primitive' as Data,
                at: 0,
              };
              const has = t.logicalExpression(
                '&&',
                t.binaryExpression(
                  '!=',
                  t.cloneNode(spread.code, true),
                  t.nullLiteral(),
                ),
                t.callExpression(
                  t.memberExpression(
                    t.identifier('Object'),
                    t.identifier('hasOwn'),
                  ),
                  [t.cloneNode(spread.code, true), t.stringLiteral(name)],
                ),
              );
              /*
               * Object.hasOwn is required to preserve earlier attributes when a
               * later spread has no own field. A shadowed Object is a barrier.
               */
              if (scope.getBinding('Object') !== undefined) return result();
              props.set(name, {
                code: t.conditionalExpression(
                  has,
                  t.memberExpression(
                    t.cloneNode(spread.code, true),
                    t.stringLiteral(name),
                    true,
                  ),
                  t.cloneNode(previous.code, true),
                ),
                data: joinServerPreloadData('immutable-data', previous.data),
                at: Math.max(spread.at, previous.at),
                stable: spread.stable === true && previous.stable === true,
              });
            }
          } else if (t.isJSXIdentifier(attr.name)) {
            const value =
              attr.value == null
                ? {
                    code: t.booleanLiteral(true),
                    data: 'primitive' as Data,
                    at: 0,
                    stable: true,
                  }
                : t.isStringLiteral(attr.value)
                  ? {
                      code: t.cloneNode(attr.value),
                      data: 'primitive' as Data,
                      at: 0,
                      stable: true,
                    }
                  : t.isJSXExpressionContainer(attr.value)
                    ? expression(attr.value.expression, scope, env, info)
                    : null;
            if (value !== null) {
              props.set(attr.name.name, value);
              unavailable.delete(attr.name.name);
            } else unavailable.add(attr.name.name);
          }
        }
        const args = names.map(
          name =>
            props.get(name) ?? {
              code: t.unaryExpression('void', t.numericLiteral(0)),
              data: 'primitive' as Data,
              at: 0,
              stable: true,
            },
        );
        const target = names.some(name => unavailable.has(name))
          ? null
          : callable(t.identifier(tag), scope, args);
        if (target !== null && !target.resource && target.component)
          groups.push({
            body: [
              t.expressionStatement(
                useRuntime('plan', [
                  t.cloneNode(target.id),
                  t.arrayExpression(
                    args.map(arg => t.cloneNode(arg.code, true)),
                  ),
                ]),
              ),
            ],
            at: Math.max(0, ...args.map(arg => arg.at)),
          });
      }
      if (
        (t.isJSXIdentifier(node.openingElement.name) &&
          /^[a-z]/.test(node.openingElement.name.name)) ||
        container(node.openingElement.name, scope)
      )
        for (const child of node.children)
          groups.push(...jsxPlan(child, scope, env, info).groups);
    } else if (t.isJSXFragment(node)) {
      for (const child of node.children)
        groups.push(...jsxPlan(child, scope, env, info).groups);
    } else if (t.isArrayExpression(node)) {
      for (const child of node.elements)
        if (child !== null)
          groups.push(...jsxPlan(child, scope, env, info).groups);
    } else {
      const mapped = jsxMap(node, scope, env, info);
      if (mapped !== null)
        groups.push({
          body: [t.expressionStatement(mapped.code)],
          at: mapped.at,
        });
    }
    return result();
  };

  const asStatements = (
    path: NodePath<t.Statement>,
  ): Array<NodePath<t.Statement>> =>
    path.isBlockStatement() ? path.get('body') : [path];
  const externalAt = (
    paths: Array<NodePath<t.Statement>>,
    env: Environment,
  ): number => {
    let at = 0;
    for (const path of paths) {
      path.traverse({
        Function(nested) {
          nested.skip();
        },
        Identifier(reference) {
          if (!reference.isReferencedIdentifier()) {
            return;
          }
          const binding = reference.scope.getBinding(reference.node.name);
          if (binding !== undefined) {
            at = Math.max(at, env.get(binding)?.at ?? 0);
          }
        },
      });
    }
    return at;
  };
  const planBlock = (
    paths: Array<NodePath<t.Statement>>,
    initial: Environment,
    info: Info,
  ): Plan => {
    const env: Environment = new Map(
      Array.from(initial, ([binding, value]) => [binding, {...value, at: 0}]),
    );
    const starts = new Map<number, Array<t.Statement>>();
    const body: Array<Array<t.Statement>> = [];
    let work = false;
    let complete = true;
    let returns = false;
    let mayReturn = false;
    let floor = 0;
    let result: Data = 'unknown';
    let consumed = 0;
    const suspensions: Array<number> = [];
    const start = (at: number, statements: Array<t.Statement>): void => {
      const target = Math.max(at, floor);
      const list = starts.get(target) ?? [];
      list.push(...statements);
      starts.set(target, list);
    };
    for (let index = 0; index < paths.length; index++) {
      const path = paths[index];
      const node = path.node;
      const scope = path.scope;
      const output: Array<t.Statement> = [];
      let accepted = false;
      let declaration: t.VariableDeclarator | null = null;
      let awaited: t.Expression | null = null;
      if (
        t.isVariableDeclaration(node, {kind: 'const'}) &&
        node.declarations.length === 1 &&
        t.isIdentifier(node.declarations[0].id)
      ) {
        declaration = node.declarations[0];
        if (t.isAwaitExpression(declaration.init)) {
          awaited = declaration.init.argument;
        } else if (declaration.init != null) {
          const value = expression(declaration.init, scope, env, info);
          const binding = scope.getBinding(
            (declaration.id as t.Identifier).name,
          );
          if (value !== null && binding?.constant) {
            const id = program.scope.generateUidIdentifier(
              binding.identifier.name,
            );
            start(value.at, [
              t.variableDeclaration('const', [
                t.variableDeclarator(id, t.cloneNode(value.code, true)),
              ]),
            ]);
            env.set(binding, {
              ...value,
              code: id,
            });
            work ||= value.work === true;
            accepted = true;
          }
        }
      } else if (
        t.isExpressionStatement(node) &&
        t.isAwaitExpression(node.expression)
      ) {
        awaited = node.expression.argument;
      } else if (
        t.isReturnStatement(node) &&
        t.isAwaitExpression(node.argument)
      ) {
        awaited = node.argument.argument;
      }
      if (awaited !== null && t.isCallExpression(awaited)) {
        const args = argumentsFor(awaited, scope, env, info);
        const target = callable(awaited.callee, scope, args ?? undefined);
        if (target !== null && args !== null && !target.component) {
          const at = Math.max(0, ...args.map(arg => arg.at));
          if (!target.resource && !target.complete) {
            start(at, [
              t.expressionStatement(
                useRuntime('plan', [
                  t.cloneNode(target.id),
                  t.arrayExpression(
                    args.map(arg => t.cloneNode(arg.code, true)),
                  ),
                ]),
              ),
            ]);
            work = true;
          } else {
            const task = program.scope.generateUidIdentifier('task');
            const consumedValue = target.resource
              ? t.memberExpression(
                  t.awaitExpression(t.cloneNode(task)),
                  t.identifier('value'),
                )
              : t.awaitExpression(t.cloneNode(task));
            const call = target.resource
              ? useRuntime('read', [
                  t.cloneNode(target.id),
                  t.arrayExpression(
                    args.map(arg => t.cloneNode(arg.code, true)),
                  ),
                  t.stringLiteral(readLabel(info, target.id, awaited)),
                ])
              : useRuntime('fork', [
                  t.arrowFunctionExpression(
                    [],
                    t.callExpression(
                      t.cloneNode(target.id),
                      args.map(arg => t.cloneNode(arg.code, true)),
                    ),
                  ),
                ]);
            start(at, [
              t.variableDeclaration('const', [
                t.variableDeclarator(task, call),
              ]),
            ]);
            if (declaration !== null) {
              const binding = scope.getBinding(
                (declaration.id as t.Identifier).name,
              );
              if (binding?.constant) {
                const id = program.scope.generateUidIdentifier(
                  binding.identifier.name,
                );
                output.push(
                  t.variableDeclaration('const', [
                    t.variableDeclarator(id, t.cloneNode(consumedValue, true)),
                  ]),
                );
                env.set(binding, {
                  code: id,
                  data: target.result,
                  at: index + 1,
                  stable: target.resource,
                });
                accepted = true;
              }
            } else if (t.isReturnStatement(node)) {
              if (info.component || target.result === 'unknown') {
                output.push(
                  t.expressionStatement(t.cloneNode(consumedValue, true)),
                  t.returnStatement(),
                );
                accepted = info.component || target.result !== 'unknown';
              } else {
                output.push(
                  t.returnStatement(t.cloneNode(consumedValue, true)),
                );
                accepted = true;
              }
              returns = true;
              result = target.result;
            } else {
              output.push(
                t.expressionStatement(t.awaitExpression(t.cloneNode(task))),
              );
              accepted = true;
            }
            work = true;
            suspensions.push(index);
          }
        }
      }
      if (awaited !== null && !accepted) {
        const value = expression(awaited, scope, env, info);
        const data = value?.pending ?? value?.data ?? 'unknown';
        if (value !== null && data !== 'unknown') {
          const task = program.scope.generateUidIdentifier('pending');
          start(value.at, [
            t.variableDeclaration('const', [
              t.variableDeclarator(task, t.cloneNode(value.code, true)),
            ]),
          ]);
          const consumed = t.awaitExpression(t.cloneNode(task));
          if (declaration !== null) {
            const binding = scope.getBinding(
              (declaration.id as t.Identifier).name,
            );
            if (binding?.constant) {
              const id = program.scope.generateUidIdentifier(
                binding.identifier.name,
              );
              output.push(
                t.variableDeclaration('const', [
                  t.variableDeclarator(id, consumed),
                ]),
              );
              env.set(binding, {
                code: id,
                data,
                at: index + 1,
                stable: value.resolvedStable,
              });
              accepted = true;
            }
          } else if (t.isReturnStatement(node)) {
            output.push(t.returnStatement(consumed));
            returns = true;
            result = data;
            accepted = true;
          } else {
            output.push(t.expressionStatement(consumed));
            accepted = true;
          }
          if (accepted) {
            suspensions.push(index);
            work ||= value.work === true;
          }
        }
      }
      if (t.isReturnStatement(node) && awaited === null) {
        if (node.argument == null) {
          output.push(t.returnStatement());
          accepted = true;
          returns = true;
        } else if (
          (t.isJSXElement(node.argument) ||
            t.isJSXFragment(node.argument) ||
            t.isLogicalExpression(node.argument) ||
            t.isConditionalExpression(node.argument)) &&
          info.component &&
          jsxPure(node.argument, scope, env, info)
        ) {
          const children = jsxPlan(node.argument, scope, env, info);
          for (const group of children.groups) start(group.at, group.body);
          work ||= children.body.length !== 0;
          output.push(t.returnStatement());
          accepted = true;
          returns = true;
        } else {
          const value = expression(node.argument, scope, env, info);
          if (value !== null && (info.component || value.data !== 'unknown')) {
            output.push(
              t.returnStatement(
                info.component ? null : t.cloneNode(value.code, true),
              ),
            );
            work ||= value.work === true;
            accepted = true;
            returns = true;
            result = value.data;
          } else if (t.isCallExpression(node.argument)) {
            const args = argumentsFor(node.argument, scope, env, info);
            const target = callable(
              node.argument.callee,
              scope,
              args ?? undefined,
            );
            if (
              target !== null &&
              args !== null &&
              !target.component &&
              target.complete
            ) {
              const read = target.resource
                ? t.memberExpression(
                    t.awaitExpression(
                      useRuntime('read', [
                        t.cloneNode(target.id),
                        t.arrayExpression(
                          args.map(arg => t.cloneNode(arg.code, true)),
                        ),
                        t.stringLiteral(
                          readLabel(info, target.id, node.argument),
                        ),
                      ]),
                    ),
                    t.identifier('value'),
                  )
                : t.awaitExpression(
                    t.callExpression(
                      t.cloneNode(target.id),
                      args.map(arg => t.cloneNode(arg.code, true)),
                    ),
                  );
              if (info.component || target.result === 'unknown') {
                output.push(t.expressionStatement(read), t.returnStatement());
                accepted = info.component;
              } else {
                output.push(t.returnStatement(read));
                accepted = true;
              }
              returns = true;
              result = target.result;
              work = true;
            }
          }
        }
      }
      if (path.isIfStatement()) {
        const test = expression(path.node.test, scope, env, info);
        if (test !== null) {
          const yes = planBlock(
            asStatements(path.get('consequent')),
            env,
            info,
          );
          const alternate = path.get('alternate');
          const no: Plan =
            alternate.node == null
              ? {
                  body: [],
                  work: false,
                  complete: true,
                  returns: false,
                  mayReturn: false,
                  result: 'unknown',
                  consumed: 0,
                }
              : planBlock(
                  asStatements(alternate as NodePath<t.Statement>),
                  env,
                  info,
                );
          const condition = t.ifStatement(
            t.cloneNode(test.code, true),
            t.blockStatement(yes.body),
            alternate.node == null ? null : t.blockStatement(no.body),
          );
          const at = Math.max(test.at, externalAt([path], env));
          if (
            (yes.work || no.work) &&
            suspensions.some(position => position >= at)
          ) {
            start(at, [
              t.expressionStatement(
                useRuntime('launch', [
                  t.arrowFunctionExpression(
                    [],
                    t.blockStatement([t.cloneNode(condition, true)]),
                    true,
                  ),
                ]),
              ),
            ]);
          }
          output.push(condition);
          work ||= yes.work || no.work;
          accepted = yes.complete && no.complete;
          returns = yes.returns && no.returns;
          mayReturn ||= yes.mayReturn || no.mayReturn;
          if (yes.mayReturn || no.mayReturn) {
            floor = index + 1;
          }
          result = yes.result === no.result ? yes.result : 'unknown';
        }
      }
      if (
        path.isForOfStatement() &&
        !path.node.await &&
        t.isVariableDeclaration(path.node.left, {kind: 'const'}) &&
        path.node.left.declarations.length === 1 &&
        t.isIdentifier(path.node.left.declarations[0].id)
      ) {
        const values = expression(path.node.right, scope, env, info);
        const binding = path
          .get('body')
          .scope.getBinding(path.node.left.declarations[0].id.name);
        if (
          values !== null &&
          values.data === 'array' &&
          binding !== undefined
        ) {
          const item = program.scope.generateUidIdentifier('item');
          const iterationEnv = new Map(env);
          iterationEnv.set(binding, {
            code: item,
            data: 'immutable-data',
            at: 0,
            stable: values.stable,
          });
          const iteration = planBlock(
            asStatements(path.get('body')),
            iterationEnv,
            info,
          );
          if (iteration.complete && !iteration.mayReturn) {
            const task = program.scope.generateUidIdentifier('iterations');
            const callback = t.arrowFunctionExpression(
              [item],
              t.blockStatement(iteration.body),
              true,
            );
            start(
              Math.max(
                values.at,
                externalAt(asStatements(path.get('body')), env),
              ),
              [
                t.variableDeclaration('const', [
                  t.variableDeclarator(
                    task,
                    useRuntime('fork', [
                      t.arrowFunctionExpression(
                        [],
                        useRuntime('each', [
                          t.cloneNode(values.code, true),
                          callback,
                        ]),
                      ),
                    ]),
                  ),
                ]),
              ],
            );
            output.push(t.expressionStatement(t.awaitExpression(task)));
            accepted = true;
            work ||= iteration.work;
          }
        }
      }
      if (path.isTryStatement()) {
        const bodyPlan = planBlock(path.get('block').get('body'), env, info);
        const handlerPath = path.get('handler');
        const handlerEnv = new Map(env);
        let error: t.Identifier | null = null;
        if (
          handlerPath.node != null &&
          t.isIdentifier(handlerPath.node.param)
        ) {
          const binding = handlerPath.scope.getBinding(
            handlerPath.node.param.name,
          );
          if (binding !== undefined) {
            error = program.scope.generateUidIdentifier('error');
            handlerEnv.set(binding, {code: error, data: 'unknown', at: 0});
          }
        }
        const caught = handlerPath.isCatchClause()
          ? planBlock(handlerPath.get('body').get('body'), handlerEnv, info)
          : null;
        const finalizerPath = path.get('finalizer');
        const finalizer = finalizerPath.isBlockStatement()
          ? planBlock(finalizerPath.get('body'), env, info)
          : null;
        if (
          bodyPlan.complete &&
          (caught === null || caught.complete) &&
          (finalizer === null || finalizer.complete)
        ) {
          const catchId =
            caught === null
              ? null
              : (error ?? program.scope.generateUidIdentifier('cancelled'));
          const catchBody =
            caught === null
              ? []
              : [
                  t.ifStatement(
                    useRuntime('isCancelled', [t.cloneNode(catchId!)]),
                    t.throwStatement(t.cloneNode(catchId!)),
                  ),
                  ...caught.body,
                ];
          output.push(
            t.tryStatement(
              t.blockStatement(bodyPlan.body),
              caught === null
                ? null
                : t.catchClause(catchId, t.blockStatement(catchBody)),
              finalizer === null ? null : t.blockStatement(finalizer.body),
            ),
          );
          accepted = true;
          work ||=
            bodyPlan.work || caught?.work === true || finalizer?.work === true;
          returns = bodyPlan.returns && (caught === null || caught.returns);
          mayReturn ||=
            bodyPlan.mayReturn ||
            caught?.mayReturn === true ||
            finalizer?.mayReturn === true;
          if (mayReturn) {
            floor = index + 1;
          }
        }
      }
      if (!accepted) {
        complete = false;
        if (output.length !== 0) {
          body.push(output);
          consumed++;
        }
        break;
      }
      body.push(output);
      consumed++;
      mayReturn ||= returns;
      if (returns) {
        break;
      }
    }
    const output: Array<t.Statement> = [];
    for (let index = 0; index <= body.length; index++) {
      output.push(...(starts.get(index) ?? []), ...(body[index] ?? []));
    }
    return {body: output, work, complete, returns, mayReturn, result, consumed};
  };

  const initialEnvironment = (info: Info, original: boolean): Environment => {
    const env: Environment = new Map();
    for (const param of info.params) {
      if (param.binding !== null) {
        env.set(param.binding, {
          code: original
            ? t.identifier(param.binding.identifier.name)
            : param.id,
          data: param.proof?.data ?? 'unknown',
          stable: param.proof?.stable,
          at: 0,
        });
      }
    }
    if (info.wholeProps !== null) {
      env.set(info.wholeProps, {
        code: original
          ? t.identifier(info.wholeProps.identifier.name)
          : t.objectExpression([]),
        data: 'unknown',
        at: 0,
        props: true,
      });
    }
    return env;
  };
  const build = (info: Info): Plan | null => {
    if (info.state === 'building') {
      return null;
    }
    if (info.state === 'built') {
      return info.plan;
    }
    info.state = 'building';
    if (info.valid && t.isBlockStatement(info.fn.node.body)) {
      info.plan = planBlock(
        info.fn.get('body').get('body') as Array<NodePath<t.Statement>>,
        initialEnvironment(info, false),
        info,
      );
    }
    info.state = 'built';
    return info.plan;
  };
  for (const info of [...infos.values(), ...anonymousInfos]) {
    build(info);
  }

  let changed = false;
  const mutations: Array<() => void> = [];
  const instrument = (
    paths: Array<NodePath<t.Statement>>,
    initial: Environment,
    info: Info,
    first: boolean,
  ): void => {
    const env = new Map(initial);
    let segment = true;
    for (let index = 0; index < paths.length; index++) {
      const path = paths[index];
      const node = path.node;
      if (segment) {
        const plan = planBlock(paths.slice(index), env, info);
        if (plan.work) {
          if (!(first && index === 0 && info.plan?.work && info.valid)) {
            segments.push({
              id: `${planId(info)}:segment:${node.start ?? index}`,
              name: info.name + ' (after barrier)',
              body: plan.body,
            });
          }
          report(
            node,
            info.fn,
            'preload',
            'Extract cached reads and guarded data dependencies into an observed request plan',
          );
          if (emit && config.features.preloading) {
            if (first && index === 0 && info.plan?.work && info.valid) {
              const args = info.params.map(param =>
                param.binding !== null
                  ? t.identifier(param.binding.identifier.name)
                  : t.memberExpression(
                      t.identifier(info.wholeProps!.identifier.name),
                      t.stringLiteral(param.name),
                      true,
                    ),
              );
              mutations.push(() =>
                path.insertBefore(
                  t.expressionStatement(
                    useRuntime('plan', [
                      t.cloneNode(info.id),
                      t.arrayExpression(args),
                    ]),
                  ),
                ),
              );
            } else {
              mutations.push(() =>
                path.insertBefore(
                  t.expressionStatement(
                    useRuntime('launch', [
                      t.arrowFunctionExpression(
                        [],
                        t.blockStatement(plan.body),
                        true,
                      ),
                    ]),
                  ),
                ),
              );
            }
            changed = true;
          }
        }
        segment = false;
      }
      let transparent = false;
      if (
        path.isVariableDeclaration() &&
        path.node.kind === 'const' &&
        path.node.declarations.length === 1 &&
        t.isIdentifier(path.node.declarations[0].id)
      ) {
        const declaration = path.node.declarations[0];
        const binding = path.scope.getBinding(
          (declaration.id as t.Identifier).name,
        );
        if (binding?.constant && declaration.init != null) {
          if (
            t.isAwaitExpression(declaration.init) &&
            t.isCallExpression(declaration.init.argument)
          ) {
            const call = declaration.init.argument;
            const target = callable(call.callee, path.scope);
            const args = argumentsFor(call, path.scope, env, info);
            if (target !== null && args !== null) {
              if (target.resource)
                managedReads.add(readLabel(info, target.id, call));
              if (target.resource && emit) {
                const replacement = t.memberExpression(
                  t.awaitExpression(
                    useRuntime('read', [
                      t.cloneNode(target.id),
                      t.arrayExpression(call.arguments as Array<t.Expression>),
                      t.stringLiteral(readLabel(info, target.id, call)),
                    ]),
                  ),
                  t.identifier('value'),
                );
                mutations.push(() => {
                  declaration.init = replacement;
                });
                changed = true;
              }
              env.set(binding, {
                code: t.identifier(binding.identifier.name),
                data: target.result,
                at: 0,
                stable: target.resource,
              });
              transparent = target.complete;
            } else {
              const value = expression(call, path.scope, env, info);
              if (
                value !== null &&
                (value.pending ?? value.data) !== 'unknown'
              ) {
                env.set(binding, {
                  ...value,
                  code: t.identifier(binding.identifier.name),
                  data: value.pending ?? value.data,
                  pending: undefined,
                  sequence: undefined,
                  at: 0,
                  stable:
                    value.pending !== undefined
                      ? value.resolvedStable
                      : value.stable,
                });
                transparent = true;
              }
            }
          } else {
            const value = expression(
              t.isAwaitExpression(declaration.init)
                ? declaration.init.argument
                : declaration.init,
              path.scope,
              env,
              info,
            );
            if (
              value !== null &&
              (!t.isAwaitExpression(declaration.init) ||
                (value.pending ?? value.data) !== 'unknown')
            ) {
              env.set(binding, {
                code: t.identifier(binding.identifier.name),
                data: value.data,
                at: 0,
                stable: value.stable,
              });
              transparent = true;
            }
          }
        }
      } else if (
        (t.isExpressionStatement(node) &&
          t.isAwaitExpression(node.expression)) ||
        (t.isReturnStatement(node) && t.isAwaitExpression(node.argument))
      ) {
        const awaited = t.isExpressionStatement(node)
          ? (node.expression as t.AwaitExpression)
          : (node.argument as t.AwaitExpression);
        if (t.isCallExpression(awaited.argument)) {
          const call = awaited.argument;
          const target = callable(call.callee, path.scope);
          const args = argumentsFor(call, path.scope, env, info);
          if (target !== null && args !== null) {
            if (target.resource)
              managedReads.add(readLabel(info, target.id, call));
            if (target.resource && emit) {
              const value = t.memberExpression(
                t.awaitExpression(
                  useRuntime('read', [
                    t.cloneNode(target.id),
                    t.arrayExpression(call.arguments as Array<t.Expression>),
                    t.stringLiteral(readLabel(info, target.id, call)),
                  ]),
                ),
                t.identifier('value'),
              );
              if (t.isExpressionStatement(node)) {
                mutations.push(() => {
                  node.expression = value;
                });
              } else if (t.isReturnStatement(node)) {
                mutations.push(() => {
                  node.argument = value;
                });
              }
              changed = true;
            }
            transparent = target.complete;
          }
        }
      }
      if (path.isIfStatement()) {
        instrument(
          asStatements(path.get('consequent')),
          new Map(env),
          info,
          false,
        );
        const alternate = path.get('alternate');
        if (alternate.node != null) {
          instrument(
            asStatements(alternate as NodePath<t.Statement>),
            new Map(env),
            info,
            false,
          );
        }
      } else if (path.isTryStatement()) {
        instrument(path.get('block').get('body'), new Map(env), info, false);
        const handler = path.get('handler');
        if (handler.isCatchClause()) {
          instrument(
            handler.get('body').get('body'),
            new Map(env),
            info,
            false,
          );
        }
        const finalizer = path.get('finalizer');
        if (finalizer.isBlockStatement()) {
          instrument(finalizer.get('body'), new Map(env), info, false);
        }
      } else if (path.isForOfStatement()) {
        const loopEnv = new Map(env);
        if (
          t.isVariableDeclaration(path.node.left) &&
          t.isIdentifier(path.node.left.declarations[0]?.id)
        ) {
          const id = path.node.left.declarations[0].id as t.Identifier;
          const binding = path.get('body').scope.getBinding(id.name);
          const values = expression(path.node.right, path.scope, env, info);
          if (binding !== undefined && values?.data === 'array') {
            loopEnv.set(binding, {
              code: t.identifier(id.name),
              data: 'immutable-data',
              at: 0,
              stable: values.stable,
            });
          }
        }
        instrument(asStatements(path.get('body')), loopEnv, info, false);
      }
      if (!transparent) {
        for (const [binding, value] of env) {
          if (
            value.props === true ||
            (value.data !== 'primitive' && value.stable !== true)
          ) {
            env.set(binding, {
              ...value,
              data: 'unknown',
              props: false,
              pending: undefined,
              sequence: undefined,
              resolvedStable: undefined,
            });
          }
        }
        segment = true;
        let reason =
          'Expression lacks a proof that evaluation is pure and its inputs are immutable';
        let value: t.Node | null | undefined = t.isExpressionStatement(node)
          ? node.expression
          : t.isReturnStatement(node)
            ? node.argument
            : t.isVariableDeclaration(node) && node.declarations.length === 1
              ? node.declarations[0].init
              : null;
        if (t.isAwaitExpression(value)) {
          value = value.argument;
        }
        if (t.isCallExpression(value)) {
          const callee = t.isIdentifier(value.callee)
            ? value.callee.name
            : t.isMemberExpression(value.callee) &&
                t.isIdentifier(value.callee.object) &&
                t.isIdentifier(value.callee.property) &&
                !value.callee.computed
              ? value.callee.object.name + '.' + value.callee.property.name
              : '<dynamic call>';
          reason = `Call ${callee} or its arguments lack a complete safe plan; preserve its original ordering`;
        } else if (t.isForOfStatement(node)) {
          reason =
            'Loop iteration, mutation or control flow lacks a complete immutable-array proof';
        } else if (t.isTryStatement(node)) {
          reason =
            'Preserve exception-region ordering and any unknown catch/finally effects';
        } else if (t.isIfStatement(node)) {
          reason = 'Preserve branch guards and branch-local effect boundaries';
        } else if (
          t.isReturnStatement(node) &&
          node.argument != null &&
          (t.isJSXElement(node.argument) || t.isJSXFragment(node.argument))
        ) {
          if (jsxPure(node.argument, path.scope, env, info)) {
            continue;
          }
          reason =
            'JSX argument evaluation contains an unknown expression, spread or dynamic component';
        }
        report(node, info.fn, 'retain', reason);
      }
    }
  };

  // Export names are resolved by module binding, including aliases/defaults.
  const exported = new Map<string, Info>();
  const existing = new Set<string>();
  for (const path of program.get('body')) {
    if (path.isExportDefaultDeclaration()) {
      existing.add('default');
      const declaration = path.node.declaration;
      const id = t.isIdentifier(declaration)
        ? declaration
        : t.isFunctionDeclaration(declaration)
          ? declaration.id
          : null;
      if (id != null) {
        const binding = program.scope.getBinding(id.name);
        const info = binding === undefined ? undefined : infos.get(binding);
        if (info !== undefined) {
          exported.set('default', info);
        }
      } else {
        const info = anonymousInfos.find(
          value => value.fn.node === declaration,
        );
        if (info !== undefined) {
          exported.set('default', info);
        }
      }
    } else if (path.isExportNamedDeclaration()) {
      if (path.node.declaration != null) {
        for (const name of Object.keys(
          t.getBindingIdentifiers(path.node.declaration),
        )) {
          existing.add(name);
          const binding = program.scope.getBinding(name);
          let info = binding === undefined ? undefined : infos.get(binding);
          if (
            info === undefined &&
            binding?.path.isVariableDeclarator() &&
            t.isIdentifier(binding.path.node.init)
          ) {
            const target = binding.path.scope.getBinding(
              binding.path.node.init.name,
            );
            info = target === undefined ? undefined : infos.get(target);
          }
          if (info !== undefined) {
            exported.set(name, info);
          }
        }
      }
      for (const spec of path.node.specifiers) {
        const name = t.isIdentifier(spec.exported)
          ? spec.exported.name
          : spec.exported.value;
        existing.add(name);
        if (path.node.source == null && t.isExportSpecifier(spec)) {
          const binding = program.scope.getBinding(spec.local.name);
          let info = binding === undefined ? undefined : infos.get(binding);
          if (
            info === undefined &&
            binding?.path.isVariableDeclarator() &&
            t.isIdentifier(binding.path.node.init)
          ) {
            const target = binding.path.scope.getBinding(
              binding.path.node.init.name,
            );
            info = target === undefined ? undefined : infos.get(target);
          }
          if (info !== undefined) {
            exported.set(name, info);
          }
        }
      }
    }
  }
  for (const [name, info] of exported) {
    if (!info.valid) continue;
    const generic = info.plan;
    const strongInfo =
      info.params.length === 0
        ? info
        : specialize(
            info,
            info.params.map(() => ({data: 'immutable-data', stable: true})),
          );
    const strong = build(strongInfo);
    const eligible = (plan: Plan | null): plan is Plan =>
      plan !== null && (plan.work || (!info.component && plan.complete));
    const primary = eligible(generic)
      ? info
      : eligible(strong)
        ? strongInfo
        : null;
    if (primary === null) continue;
    const plan = primary.plan!;
    const preload = '__reactPreload_' + name;
    if (existing.has(preload)) {
      report(
        info.fn.node,
        info.fn,
        'skip',
        `Preload export ${preload} already exists`,
      );
      continue;
    }
    const dataName = '__reactPreloadData_' + name;
    const hasData =
      primary === info &&
      strongInfo !== info &&
      eligible(strong) &&
      !existing.has(dataName);
    pass.opts.logger?.logEvent(pass.filename, {
      kind: 'ServerPreloadSummary',
      fnLoc: info.fn.node.loc ?? null,
      component: name,
      planId: planId(primary),
      preload,
      props: info.params.map(p => p.name),
      functionKind: info.component ? 'component' : 'function',
      complete: plan.complete,
      result: plan.result,
      ...(primary !== info ? {requiresData: true} : {}),
      ...(hasData
        ? {
            dataPreload: {
              preload: dataName,
              planId: planId(strongInfo),
              complete: strong!.complete,
              result: strong!.result,
            },
          }
        : {}),
    });
    if (emit) {
      for (const [id, name] of [
        [primary.id, preload],
        ...(hasData ? [[strongInfo.id, dataName] as const] : []),
      ] as Array<readonly [t.Identifier, string]>)
        program.pushContainer(
          'body',
          t.exportNamedDeclaration(null, [
            t.exportSpecifier(
              t.cloneNode(id),
              t.isValidIdentifier(name)
                ? t.identifier(name)
                : t.stringLiteral(name),
            ),
          ]),
        );
      changed = true;
    }
  }
  // Keep analysis on untouched source until every plan has been extracted.
  for (const info of [...infos.values(), ...anonymousInfos]) {
    if (t.isBlockStatement(info.fn.node.body)) {
      instrument(
        info.fn.get('body').get('body') as Array<NodePath<t.Statement>>,
        initialEnvironment(info, true),
        info,
        true,
      );
    }
  }
  for (const mutate of mutations) mutate();
  const targets = new Map<string, {id: string; result: boolean}>();
  const planSources: Array<PreloadPlanSource> = [...segments];
  for (const info of [...infos.values(), ...anonymousInfos, ...variants]) {
    targets.set(info.id.name, {id: planId(info), result: !info.component});
    if (info.plan !== null && info.valid) {
      planSources.push({
        id: planId(info),
        name: info.name,
        body: info.plan.body,
        result: !info.component,
      });
    }
  }
  for (const [binding, id] of [...importedPlans, ...importedDataPlans]) {
    const base = importedBindings.get(binding)!;
    const imported =
      importedDataPlans.get(binding) === id
        ? {...base, ...base.dataPreload!}
        : base;
    if (imported.planId !== undefined) {
      targets.set(id.name, {
        id: imported.planId,
        result: imported.functionKind === 'function',
      });
    }
  }
  const dependencyGraph = analyzeServerPreloadPlans(
    planSources,
    runtimeNames,
    targets,
    locations,
    pass.filename ?? '<server>',
    managedReads,
  );
  pass.opts.logger?.logEvent(pass.filename, {
    kind: 'ServerPreloadGraph',
    fnLoc: null,
    graph: dependencyGraph,
  });
  const paths =
    pass.serverPreloadCriticalPaths ??
    serverPreloadCriticalPaths(dependencyGraph);
  if (emit && config.features.criticalPath) {
    for (const call of readCalls) {
      const label = call.arguments[2];
      if (!t.isStringLiteral(label)) {
        continue;
      }
      const path = paths.get(label.value);
      if (path !== undefined) {
        call.arguments[3] = t.objectExpression([
          t.objectProperty(
            t.identifier('criticalPath'),
            t.arrayExpression(path.map(value => t.stringLiteral(value))),
          ),
        ]);
      }
    }
  }
  if (emit && changed) {
    // Plans may call other plans directly; emit all proven local definitions.
    for (const info of [...infos.values(), ...anonymousInfos, ...variants]) {
      if (
        info.plan !== null &&
        info.valid &&
        (info.plan.work || (!info.component && info.plan.complete))
      ) {
        const declaration = t.functionDeclaration(
          t.cloneNode(info.id),
          info.params.map(p =>
            p.fallback === undefined
              ? t.cloneNode(p.id)
              : t.assignmentPattern(
                  t.cloneNode(p.id),
                  t.cloneNode(p.fallback, true),
                ),
          ),
          t.blockStatement(info.plan.body),
          false,
          true,
        );
        program.pushContainer('body', declaration);
      }
    }
    for (const [binding, id] of [...importedPlans, ...importedDataPlans]) {
      const base = importedBindings.get(binding)!;
      const imported =
        importedDataPlans.get(binding) === id
          ? {...base, ...base.dataPreload!}
          : base;
      program.unshiftContainer(
        'body',
        t.importDeclaration(
          [
            t.importSpecifier(
              id,
              t.isValidIdentifier(imported.preload)
                ? t.identifier(imported.preload)
                : t.stringLiteral(imported.preload),
            ),
          ],
          t.stringLiteral(imported.source),
        ),
      );
    }
    if (runtimeNames.size !== 0) {
      program.unshiftContainer(
        'body',
        t.importDeclaration(
          Array.from(runtimeNames, ([name, id]) =>
            t.importSpecifier(id, t.identifier(name)),
          ),
          t.stringLiteral(runtimeModule),
        ),
      );
    }
    program.node.directives.push(t.directive(t.directiveLiteral(MARKER)));
    program.scope.crawl();
  }
  if (!emit || !changed) {
    for (const [fn, body] of normalized) {
      fn.node.body = body;
    }
  }
}
