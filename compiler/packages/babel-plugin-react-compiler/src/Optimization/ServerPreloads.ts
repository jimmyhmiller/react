/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {NodePath} from '@babel/core';
import type {Binding} from '@babel/traverse';
import * as t from '@babel/types';
import {z} from 'zod/v4';
import type {CompilerPass} from '../Entrypoint/Program';
import {CompilerError} from '../CompilerError';
import {compileServerPreloadPlans} from './ServerPreloadPlans';
import type {ServerPreloadDependencyGraph} from '../Server/ServerPreloadAnalysis';

const COMPILED_DIRECTIVE = 'use react server preloads';

const ImportSchema = z.strictObject({
  source: z.string().min(1),
  importSpecifierName: z.string().min(1),
});

/**
 * Configuration is a semantic contract, not a heuristic based on names or
 * Promise types. See docs/passes/56-serverPreloads.md before adding resources.
 */
export const ServerPreloadsOptionsSchema = z
  .strictObject({
    features: z
      .strictObject({
        preloading: z.boolean().default(true),
        batching: z.boolean().default(true),
        criticalPath: z.boolean().default(true),
        routeManifests: z.boolean().default(false),
        deferAwait: z.boolean().default(false),
        lens: z.boolean().default(true),
      })
      .prefault({}),
    resources: z
      .array(
        ImportSchema.extend({
          result: z
            .enum(['unknown', 'primitive', 'immutable-data', 'array'])
            .default('unknown'),
        }),
      )
      .default([]),
    localResources: z
      .array(
        z.strictObject({
          name: z.string().min(1),
          result: z
            .enum(['unknown', 'primitive', 'immutable-data', 'array'])
            .default('unknown'),
        }),
      )
      .default([]),
    runtime: z
      .string()
      .min(1)
      .nullable()
      .default('react-compiler-runtime/server'),
    components: z
      .array(
        ImportSchema.extend({
          preload: z.string().min(1),
          planId: z.string().optional(),
          functionKind: z.enum(['component', 'function']).default('component'),
          complete: z.boolean().default(false),
          result: z
            .enum(['unknown', 'primitive', 'immutable-data', 'array'])
            .default('unknown'),
          props: z.array(z.string()),
        }),
      )
      .default([]),
    mode: z.enum(['compile', 'analyze']).default('compile'),
  })
  .superRefine((config, context) => {
    if (
      config.runtime === null &&
      (config.features.routeManifests || config.features.deferAwait)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['runtime'],
        message: 'Route manifests and deferred awaits require a server runtime',
      });
    }
    const seen = new Set<string>();
    for (const field of ['resources', 'components'] as const) {
      config[field].forEach((entry, index) => {
        const key = JSON.stringify([entry.source, entry.importSpecifierName]);
        if (seen.has(key)) {
          context.addIssue({
            code: 'custom',
            path: [field, index],
            message: 'Duplicate or conflicting server preload import contract',
          });
        }
        seen.add(key);
      });
    }
    const locals = new Set<string>();
    config.localResources.forEach((entry, index) => {
      if (locals.has(entry.name)) {
        context.addIssue({
          code: 'custom',
          path: ['localResources', index],
          message: 'Duplicate local resource contract',
        });
      }
      locals.add(entry.name);
    });
  });
export type ServerPreloadsOptions = z.input<typeof ServerPreloadsOptionsSchema>;
export type ParsedServerPreloadsOptions = z.infer<
  typeof ServerPreloadsOptionsSchema
>;

export type ServerPreloadEvent =
  | {
      kind: 'ServerPreloadGraph';
      fnLoc: null;
      graph: ServerPreloadDependencyGraph;
    }
  | {
      kind: 'ServerPreload';
      fnLoc: t.SourceLocation | null;
      loc: t.SourceLocation | null;
      action: 'preload' | 'retain' | 'skip';
      reason: string;
    }
  | {
      kind: 'ServerPreloadSummary';
      planId?: string;
      fnLoc: t.SourceLocation | null;
      component: string;
      preload: string;
      props: Array<string>;
      functionKind?: 'component' | 'function';
      complete?: boolean;
      result?: 'unknown' | 'primitive' | 'immutable-data' | 'array';
    };

type Fn = NodePath<
  t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
>;
type Arg =
  | {kind: 'prop'; name: string}
  | {kind: 'literal'; value: t.Expression};
type Read = {
  callee: t.Identifier;
  args: Array<t.Expression>;
  companion?: boolean | undefined;
};
type Summary = {
  props: Array<string>;
  reads: Array<{
    callee: t.Identifier;
    args: Array<Arg>;
    companion?: boolean | undefined;
  }>;
};
type Component = {
  name: string;
  fn: Fn;
  binding: Binding;
  exports: Array<string>;
};
type ImportedComponent = {
  source: string;
  preload: string;
  props: Array<string>;
};

type Literal =
  | t.StringLiteral
  | t.NumericLiteral
  | t.BooleanLiteral
  | t.NullLiteral
  | t.BigIntLiteral;

function isLiteral(node: t.Node): node is Literal {
  return (
    t.isStringLiteral(node) ||
    t.isNumericLiteral(node) ||
    t.isBooleanLiteral(node) ||
    t.isNullLiteral(node) ||
    t.isBigIntLiteral(node)
  );
}

function optedOut(directives: Array<t.Directive>, pass: CompilerPass): boolean {
  return directives.some(d => {
    const value = d.value.value;
    return (
      value === 'use client' ||
      value === 'use server' ||
      (!pass.opts.ignoreUseNoForget &&
        (value === 'use no memo' ||
          value === 'use no forget' ||
          pass.opts.customOptOutDirectives?.includes(value) === true))
    );
  });
}

/**
 * A separate server entrypoint deliberately avoids reactive memo-cache codegen.
 * Analysis is performed on original syntax so unknown statements, exception
 * regions and control flow remain barriers, rather than being optimized away.
 */
function compileStaticServerPreloads(
  program: NodePath<t.Program>,
  pass: CompilerPass,
): void {
  const config = pass.opts.serverPreloads;
  if (config === null) {
    return;
  }
  if (pass.opts.gating !== null || pass.opts.dynamicGating !== null) {
    CompilerError.throwInvalidConfig({
      reason: 'Server preloads do not support memoization gating',
      description: 'Use a separate server compiler configuration.',
      suggestions: null,
      loc: null,
    });
  }
  const emit =
    config.mode === 'compile' &&
    !pass.opts.noEmit &&
    config.features.preloading;
  const log = (
    fn: Fn | null,
    node: t.Node,
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
  if (program.node.directives.some(d => d.value.value === COMPILED_DIRECTIVE)) {
    log(
      null,
      program.node,
      'skip',
      'Server preload plans are already compiled',
    );
    return;
  }
  if (optedOut(program.node.directives, pass)) {
    log(
      null,
      program.node,
      'skip',
      'Module directive excludes server preloading',
    );
    return;
  }

  const resources = new Set<Binding>();
  const transparentReactTags = new Set<Binding>();
  const reactNamespaces = new Set<Binding>();
  const importedComponents = new Map<Binding, ImportedComponent>();
  for (const stmt of program.get('body')) {
    if (
      !stmt.isImportDeclaration() ||
      (stmt.node.importKind != null && stmt.node.importKind !== 'value')
    ) {
      continue;
    }
    for (const specifier of stmt.get('specifiers')) {
      if (specifier.isImportNamespaceSpecifier()) {
        const binding = program.scope.getBinding(specifier.node.local.name);
        if (stmt.node.source.value === 'react' && binding?.constant) {
          reactNamespaces.add(binding);
        }
        continue;
      }
      if (
        !specifier.isImportSpecifier() &&
        !specifier.isImportDefaultSpecifier()
      ) {
        continue;
      }
      if (
        specifier.isImportSpecifier() &&
        specifier.node.importKind != null &&
        specifier.node.importKind !== 'value'
      ) {
        continue;
      }
      const imported = specifier.isImportDefaultSpecifier()
        ? 'default'
        : t.isIdentifier(specifier.node.imported)
          ? specifier.node.imported.name
          : specifier.node.imported.value;
      const binding = program.scope.getBinding(specifier.node.local.name);
      if (binding === undefined || !binding.constant) {
        continue;
      }
      if (stmt.node.source.value === 'react') {
        if (imported === 'Suspense' || imported === 'Fragment') {
          transparentReactTags.add(binding);
        } else if (specifier.isImportDefaultSpecifier()) {
          reactNamespaces.add(binding);
        }
      }
      const matches = (entry: {
        source: string;
        importSpecifierName: string;
      }): boolean =>
        entry.source === stmt.node.source.value &&
        entry.importSpecifierName === imported;
      if (config.resources.some(matches)) {
        resources.add(binding);
      }
      const component = config.components.find(matches);
      if (component !== undefined) {
        importedComponents.set(binding, {
          source: component.source,
          preload: component.preload,
          props: component.props,
        });
      }
    }
  }

  for (const entry of config.localResources) {
    const binding = program.scope.getBinding(entry.name);
    if (
      entry.name === 'default' &&
      binding === undefined &&
      program.node.body.some(node => t.isExportDefaultDeclaration(node))
    ) {
      continue;
    }
    if (binding === undefined || !binding.constant) {
      CompilerError.throwInvalidConfig({
        reason: 'Local resources require a stable module binding',
        description: entry.name,
        suggestions: null,
        loc: null,
      });
    }
    resources.add(binding);
  }

  const components: Array<Component> = [];
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
      let name: string | null = null;
      if (path.isFunctionDeclaration()) {
        name = path.node.id?.name ?? null;
      } else if (path.parentPath.isVariableDeclarator()) {
        const id = path.parentPath.node.id;
        name = t.isIdentifier(id) ? id.name : null;
      }
      const annotated =
        t.isBlockStatement(path.node.body) &&
        path.node.body.directives.some(
          d => d.value.value === 'use memo' || d.value.value === 'use forget',
        );
      const selected =
        pass.opts.compilationMode === 'all' ||
        (pass.opts.compilationMode === 'annotation'
          ? annotated
          : pass.opts.compilationMode !== 'syntax' &&
            (annotated || (name !== null && /^[A-Z]/.test(name))));
      if (name !== null && selected) {
        const binding = program.scope.getBinding(name);
        if (
          binding !== undefined &&
          binding.constant &&
          !resources.has(binding) &&
          (binding.path === path || binding.path === path.parentPath) &&
          t.isBlockStatement(path.node.body) &&
          !path.node.generator &&
          !optedOut(path.node.body.directives, pass)
        ) {
          components.push({name, fn: path, binding, exports: []});
        }
      }
      path.skip();
    },
  });

  // Resolve aliases/default exports by binding, not spelling.
  const exportedNames = new Set<string>();
  for (const stmt of program.get('body')) {
    if (stmt.isExportDefaultDeclaration()) {
      exportedNames.add('default');
      const declaration = stmt.node.declaration;
      const id = t.isIdentifier(declaration)
        ? declaration
        : t.isFunctionDeclaration(declaration)
          ? declaration.id
          : null;
      if (id != null) {
        const binding = program.scope.getBinding(id.name);
        components.find(c => c.binding === binding)?.exports.push('default');
      }
    } else if (stmt.isExportNamedDeclaration()) {
      const declaration = stmt.node.declaration;
      if (declaration != null) {
        for (const name of Object.keys(t.getBindingIdentifiers(declaration))) {
          exportedNames.add(name);
          const binding = program.scope.getBinding(name);
          components.find(c => c.binding === binding)?.exports.push(name);
        }
      }
      for (const specifier of stmt.node.specifiers) {
        const exported = t.isIdentifier(specifier.exported)
          ? specifier.exported.name
          : specifier.exported.value;
        exportedNames.add(exported);
        if (stmt.node.source === null && t.isExportSpecifier(specifier)) {
          const binding = program.scope.getBinding(specifier.local.name);
          components.find(c => c.binding === binding)?.exports.push(exported);
        }
      }
    }
  }

  const getResource = (fn: Fn, call: t.Node): Read | null => {
    if (!t.isCallExpression(call) || !t.isIdentifier(call.callee)) {
      return null;
    }
    const binding = fn.scope.getBinding(call.callee.name);
    if (binding === undefined || !resources.has(binding)) {
      return null;
    }
    const args: Array<t.Expression> = [];
    for (const arg of call.arguments) {
      if (!t.isIdentifier(arg) && !isLiteral(arg)) {
        return null;
      }
      args.push(arg);
    }
    return {callee: call.callee, args};
  };

  const awaitedRead = (fn: Fn, stmt: t.Statement): Read | null => {
    if (
      t.isVariableDeclaration(stmt, {kind: 'const'}) &&
      stmt.declarations.length === 1
    ) {
      const decl = stmt.declarations[0];
      if (t.isIdentifier(decl.id) && t.isAwaitExpression(decl.init)) {
        return getResource(fn, decl.init.argument);
      }
    }
    if (t.isExpressionStatement(stmt) && t.isAwaitExpression(stmt.expression)) {
      return getResource(fn, stmt.expression.argument);
    }
    return null;
  };

  const summaries = new Map<Binding, Summary>();
  const importedPreloads = new Map<Binding, t.Identifier>();
  const getImportedPreload = (
    binding: Binding,
    entry: ImportedComponent,
  ): t.Identifier => {
    let id = importedPreloads.get(binding);
    if (id === undefined) {
      id = program.scope.generateUidIdentifier(entry.preload);
      importedPreloads.set(binding, id);
    }
    return id;
  };

  const isReactTag = (
    fn: Fn,
    name: t.JSXElement['openingElement']['name'],
  ): boolean => {
    if (t.isJSXIdentifier(name)) {
      const binding = fn.scope.getBinding(name.name);
      return binding !== undefined && transparentReactTags.has(binding);
    }
    if (
      t.isJSXMemberExpression(name) &&
      t.isJSXIdentifier(name.object) &&
      (name.property.name === 'Suspense' || name.property.name === 'Fragment')
    ) {
      const binding = fn.scope.getBinding(name.object.name);
      return binding !== undefined && reactNamespaces.has(binding);
    }
    return false;
  };

  /*
   * JSX traversal visits only unconditional elements/fragments. Expressions,
   * spreads, refs and key attributes are barriers to inspecting a child.
   */
  const childReads = (fn: Fn, root: t.Node): Array<Read> => {
    const reads: Array<Read> = [];
    /*
     * Every JSX argument/expression is evaluated by the parent before React
     * renders any child. An effect anywhere in this expression can authorize
     * a child, including an expression textually after that child.
     */
    const safeJSX = (node: t.Node): boolean => {
      if (t.isJSXText(node) || t.isJSXEmptyExpression(node)) {
        return true;
      }
      if (t.isJSXExpressionContainer(node)) {
        return (
          t.isIdentifier(node.expression) ||
          isLiteral(node.expression) ||
          t.isJSXEmptyExpression(node.expression) ||
          ((t.isJSXElement(node.expression) ||
            t.isJSXFragment(node.expression)) &&
            safeJSX(node.expression))
        );
      }
      if (t.isJSXFragment(node)) {
        return node.children.every(safeJSX);
      }
      if (t.isJSXElement(node)) {
        return (
          (t.isJSXIdentifier(node.openingElement.name) ||
            isReactTag(fn, node.openingElement.name)) &&
          node.openingElement.attributes.every(
            attr =>
              t.isJSXAttribute(attr) &&
              t.isJSXIdentifier(attr.name) &&
              (attr.value == null ||
                t.isStringLiteral(attr.value) ||
                safeJSX(attr.value)),
          ) &&
          node.children.every(safeJSX)
        );
      }
      return false;
    };
    if (!safeJSX(root)) {
      return reads;
    }
    const visit = (node: t.Node): void => {
      if (
        t.isJSXExpressionContainer(node) &&
        (t.isJSXElement(node.expression) || t.isJSXFragment(node.expression))
      ) {
        visit(node.expression);
      } else if (t.isJSXFragment(node)) {
        for (const child of node.children) {
          visit(child);
        }
      } else if (t.isJSXElement(node)) {
        const opening = node.openingElement;
        if (t.isJSXIdentifier(opening.name)) {
          const binding = fn.scope.getBinding(opening.name.name);
          const local =
            binding === undefined ? undefined : resolveSummary(binding);
          const imported =
            binding === undefined ? undefined : importedComponents.get(binding);
          const props = new Map<string, t.Expression>();
          let safe = true;
          for (const attr of opening.attributes) {
            if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) {
              safe = false;
              break;
            }
            if (attr.name.name === 'ref' || attr.name.name === 'key') {
              safe = false;
              break;
            }
            const value = attr.value;
            let expr: t.Expression;
            if (value === null) {
              expr = t.booleanLiteral(true);
            } else if (t.isStringLiteral(value)) {
              expr = value;
            } else if (
              t.isJSXExpressionContainer(value) &&
              (t.isIdentifier(value.expression) || isLiteral(value.expression))
            ) {
              expr = value.expression;
            } else {
              safe = false;
              break;
            }
            props.set(attr.name.name, expr);
          }
          if (safe && local !== undefined) {
            for (const read of local.reads) {
              const args = read.args.map(arg =>
                arg.kind === 'literal' ? arg.value : props.get(arg.name),
              );
              if (args.every((arg): arg is t.Expression => arg !== undefined)) {
                if (
                  read.companion === true ||
                  fn.scope.getBinding(read.callee.name) ===
                    program.scope.getBinding(read.callee.name)
                ) {
                  reads.push({
                    callee: read.callee,
                    args,
                    companion: read.companion,
                  });
                }
              }
            }
          } else if (safe && imported !== undefined && binding !== undefined) {
            const args = imported.props.map(prop => props.get(prop));
            if (args.every((arg): arg is t.Expression => arg !== undefined)) {
              reads.push({
                callee: getImportedPreload(binding, imported),
                args,
                companion: true,
              });
            }
          }
        }
        /*
         * A child element behind an opaque component is not necessarily rendered.
         * Only native elements let us safely descend to their direct children.
         */
        if (
          (t.isJSXIdentifier(opening.name) &&
            /^[a-z]/.test(opening.name.name)) ||
          isReactTag(fn, opening.name)
        ) {
          for (const child of node.children) {
            visit(child);
          }
        }
      }
    };
    visit(root);
    return reads;
  };

  const paramProps = (fn: Fn): Map<Binding, string> | null => {
    const props = new Map<Binding, string>();
    if (fn.node.params.length !== 1 || !t.isObjectPattern(fn.node.params[0])) {
      return fn.node.params.every(param => t.isIdentifier(param))
        ? props
        : null;
    }
    for (const prop of fn.node.params[0].properties) {
      if (
        !t.isObjectProperty(prop) ||
        prop.computed ||
        !t.isIdentifier(prop.value) ||
        (!t.isIdentifier(prop.key) && !t.isStringLiteral(prop.key))
      ) {
        // Defaults/rest/computed properties can execute arbitrary user code.
        return null;
      }
      const binding = fn.scope.getBinding(prop.value.name);
      if (binding !== undefined && binding.constant) {
        props.set(
          binding,
          t.isIdentifier(prop.key) ? prop.key.name : prop.key.value,
        );
      }
    }
    return props;
  };

  /*
   * Resolve imports and local summaries lazily. A recursion edge contributes no
   * plan: components are never executed to discover their descendants.
   */
  const resolving = new Set<Binding>();
  const resolved = new Set<Binding>();
  const resolveSummary = (binding: Binding): Summary | undefined => {
    if (resolving.has(binding) || resolved.has(binding)) {
      return summaries.get(binding);
    }
    const component = components.find(c => c.binding === binding);
    if (component === undefined) {
      return undefined;
    }
    resolving.add(binding);
    const {fn} = component;
    const props = paramProps(fn);
    const reads: Summary['reads'] = [];
    const stableBindings = new Set(props?.keys());
    if (props !== null && t.isBlockStatement(fn.node.body)) {
      for (const stmt of fn.node.body.body) {
        const read = awaitedRead(fn, stmt);
        if (
          read !== null &&
          !read.args.every(
            arg =>
              isLiteral(arg) ||
              (t.isIdentifier(arg) &&
                stableBindings.has(fn.scope.getBinding(arg.name)!)),
          )
        ) {
          break;
        }
        const candidates =
          read !== null
            ? [read]
            : t.isReturnStatement(stmt) && stmt.argument != null
              ? childReads(fn, stmt.argument)
              : [];
        for (const candidate of candidates) {
          const args: Array<Arg> = [];
          let safe = true;
          for (const arg of candidate.args) {
            if (isLiteral(arg)) {
              args.push({kind: 'literal', value: arg});
            } else if (t.isIdentifier(arg)) {
              const argBinding = fn.scope.getBinding(arg.name);
              const prop =
                argBinding === undefined ? undefined : props.get(argBinding);
              if (prop === undefined) {
                safe = false;
                break;
              }
              args.push({kind: 'prop', name: prop});
            }
          }
          if (safe) {
            reads.push({
              callee: candidate.callee,
              args,
              companion: candidate.companion,
            });
          }
        }
        if (read === null) {
          break;
        }
        if (t.isVariableDeclaration(stmt)) {
          const id = stmt.declarations[0].id;
          if (t.isIdentifier(id)) {
            const result = fn.scope.getBinding(id.name);
            if (result?.constant) {
              stableBindings.add(result);
            }
          }
        }
      }
    }
    if (reads.length !== 0) {
      summaries.set(binding, {
        props: Array.from(
          new Set(
            reads.flatMap(read =>
              read.args.flatMap(arg => (arg.kind === 'prop' ? [arg.name] : [])),
            ),
          ),
        ),
        reads,
      });
    }
    resolving.delete(binding);
    resolved.add(binding);
    return summaries.get(binding);
  };
  for (const component of components) {
    resolveSummary(component.binding);
  }

  /*
   * Both cached resources and generated companion exports are safe to call
   * repeatedly. Observe rejection now; leave delivery to the original reader.
   */
  const usedPreloads = new Set<string>();
  let changed = false;
  const preload = (read: Read): t.Statement => {
    usedPreloads.add(read.callee.name);
    const call = t.callExpression(
      t.cloneNode(read.callee),
      read.args.map(arg => t.cloneNode(arg, true)),
    );
    return t.tryStatement(
      t.blockStatement([
        t.expressionStatement(
          read.companion === true
            ? call
            : t.callExpression(t.memberExpression(call, t.identifier('then')), [
                t.unaryExpression('void', t.numericLiteral(0)),
                t.arrowFunctionExpression([], t.blockStatement([])),
              ]),
        ),
      ]),
      t.catchClause(null, t.blockStatement([])),
    );
  };

  for (const component of components) {
    const {fn} = component;
    if (!t.isBlockStatement(fn.node.body)) {
      continue;
    }
    const body = fn.node.body.body;
    const available = new Map<Binding, number>();
    for (const binding of Object.values(fn.scope.bindings)) {
      if (binding.kind === 'param' && binding.constant) {
        available.set(binding, 0);
      }
    }
    const insertions = new Map<number, Array<t.Statement>>();
    let barrier = 0;
    let awaits: Array<number> = [];
    for (let index = 0; index < body.length; index++) {
      const stmt = body[index];
      const read = awaitedRead(fn, stmt);
      const candidates =
        read !== null
          ? [read]
          : t.isReturnStatement(stmt) && stmt.argument != null
            ? childReads(fn, stmt.argument)
            : [];
      for (const candidate of candidates) {
        let target = barrier;
        let safe = true;
        for (const arg of candidate.args) {
          if (t.isIdentifier(arg)) {
            const binding = fn.scope.getBinding(arg.name);
            const start =
              binding === undefined ? undefined : available.get(binding);
            if (start === undefined) {
              safe = false;
              break;
            }
            target = Math.max(target, start);
          }
        }
        if (safe && awaits.some(position => position >= target)) {
          log(
            fn,
            stmt,
            'preload',
            `Start ${candidate.callee.name} before an independent await`,
          );
          const list = insertions.get(target) ?? [];
          list.push(preload(candidate));
          insertions.set(target, list);
        } else {
          log(
            fn,
            stmt,
            'retain',
            safe
              ? 'No independent await to cross after prerequisites and ordering barriers'
              : 'Arguments are not stable parameters or preceding const bindings',
          );
        }
      }
      const stableRead =
        read !== null &&
        read.args.every(
          arg =>
            isLiteral(arg) ||
            (t.isIdentifier(arg) &&
              available.has(fn.scope.getBinding(arg.name)!)),
        );
      let transparent = false;
      if (
        t.isVariableDeclaration(stmt, {kind: 'const'}) &&
        stmt.declarations.length === 1
      ) {
        const decl = stmt.declarations[0];
        if (t.isIdentifier(decl.id)) {
          const binding = fn.scope.getBinding(decl.id.name);
          if (binding !== undefined && binding.constant) {
            const init = decl.init;
            transparent =
              stableRead ||
              (init != null &&
                (isLiteral(init) ||
                  (t.isIdentifier(init) &&
                    available.has(fn.scope.getBinding(init.name)!))));
            if (transparent) {
              available.set(binding, index + 1);
            }
          }
        }
      } else if (stableRead) {
        transparent = true;
      }
      if (transparent) {
        if (read !== null) {
          awaits.push(index);
        }
      } else {
        log(
          fn,
          stmt,
          'retain',
          'Control flow, unknown effects, or unsupported syntax is an ordering barrier',
        );
        barrier = index + 1;
        awaits = [];
      }
    }
    if (emit && insertions.size !== 0) {
      changed = true;
      fn.node.body.body = body.flatMap((stmt, index) => [
        ...(insertions.get(index) ?? []),
        stmt,
      ]);
    }
  }

  for (const component of components) {
    const summary = summaries.get(component.binding);
    if (summary === undefined) {
      continue;
    }
    for (const exported of new Set(component.exports)) {
      const exportName = `__reactPreload_${exported}`;
      if (exportedNames.has(exportName)) {
        log(
          component.fn,
          component.fn.node,
          'skip',
          `Preload export ${exportName} already exists`,
        );
        continue;
      }
      pass.opts.logger?.logEvent(pass.filename, {
        kind: 'ServerPreloadSummary',
        fnLoc: component.fn.node.loc ?? null,
        component: exported,
        preload: exportName,
        props: summary.props,
      });
      if (emit) {
        changed = true;
        const id = program.scope.generateUidIdentifier(
          'preload' + component.name,
        );
        const params = summary.props.map(prop =>
          program.scope.generateUidIdentifier(prop),
        );
        const statements = summary.reads.map(read =>
          preload({
            callee: read.callee,
            companion: read.companion,
            args: read.args.map(arg =>
              arg.kind === 'literal'
                ? arg.value
                : params[summary.props.indexOf(arg.name)],
            ),
          }),
        );
        program.pushContainer('body', [
          t.functionDeclaration(id, params, t.blockStatement(statements)),
          t.exportNamedDeclaration(null, [
            t.exportSpecifier(
              id,
              t.isValidIdentifier(exportName)
                ? t.identifier(exportName)
                : t.stringLiteral(exportName),
            ),
          ]),
        ]);
      }
    }
  }
  if (emit) {
    for (const [binding, id] of importedPreloads) {
      if (!usedPreloads.has(id.name)) {
        continue;
      }
      const entry = importedComponents.get(binding)!;
      program.unshiftContainer(
        'body',
        t.importDeclaration(
          [
            t.importSpecifier(
              id,
              t.isValidIdentifier(entry.preload)
                ? t.identifier(entry.preload)
                : t.stringLiteral(entry.preload),
            ),
          ],
          t.stringLiteral(entry.source),
        ),
      );
    }
    if (changed) {
      program.node.directives.push(
        t.directive(t.directiveLiteral(COMPILED_DIRECTIVE)),
      );
      program.scope.crawl();
    }
  }
}

export function compileServerPreloads(
  program: NodePath<t.Program>,
  pass: CompilerPass,
): void {
  if (pass.opts.serverPreloads?.runtime != null) {
    compileServerPreloadPlans(program, pass);
  } else {
    compileStaticServerPreloads(program, pass);
  }
}
