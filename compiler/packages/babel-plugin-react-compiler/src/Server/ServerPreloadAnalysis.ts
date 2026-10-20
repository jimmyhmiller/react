/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as t from '@babel/types';

export type ServerPreloadGraphNode = {
  id: string;
  kind: 'plan' | 'read' | 'call';
  label: string;
  file: string;
  line: number | null;
  column: number | null;
  /** True only when the original consumer uses the same request scheduler. */
  managed?: boolean;
};
export type ServerPreloadGraphEdge = {
  from: string;
  to: string;
  kind: 'data' | 'control' | 'call';
};
export type ServerPreloadDependencyGraph = {
  nodes: Array<ServerPreloadGraphNode>;
  edges: Array<ServerPreloadGraphEdge>;
};
export type PreloadPlanSource = {
  id: string;
  name: string;
  body: Array<t.Statement>;
  result?: boolean;
};

/** Inspect only extracted, proven plan syntax; this graph never authorizes movement. */
export function analyzeServerPreloadPlans(
  plans: Array<PreloadPlanSource>,
  runtimeNames: Map<string, t.Identifier>,
  targets: Map<string, {id: string; result: boolean}>,
  locations: Map<string, t.SourceLocation | null>,
  file: string,
  managedReads: Set<string> = new Set(),
): ServerPreloadDependencyGraph {
  const nodes = new Map<string, ServerPreloadGraphNode>();
  const edges = new Map<string, ServerPreloadGraphEdge>();
  const edge = (
    from: string,
    to: string,
    kind: ServerPreloadGraphEdge['kind'],
  ): void => {
    if (from !== to) {
      edges.set(JSON.stringify([from, to, kind]), {from, to, kind});
    }
  };
  let calls = 0;
  for (const plan of plans) {
    nodes.set(plan.id, {
      id: plan.id,
      kind: 'plan',
      label: plan.name,
      file,
      line: null,
      column: null,
    });
    if (plan.result) {
      nodes.set(plan.id + ':return', {
        id: plan.id + ':return',
        kind: 'plan',
        label: plan.name + ' result',
        file,
        line: null,
        column: null,
      });
      edge(plan.id, plan.id + ':return', 'call');
    }
    const evaluate = (
      node: t.Node | null | undefined,
      env: Map<string, Set<string>>,
      control: Set<string>,
    ): Set<string> => {
      if (node == null) {
        return new Set();
      }
      if (t.isIdentifier(node)) {
        return env.get(node.name) ?? new Set();
      }
      if (t.isFunction(node)) {
        const local = new Map(env);
        for (const name of Object.keys(t.getBindingIdentifiers(node))) {
          local.delete(name);
        }
        return evaluate(node.body, local, control);
      }
      if (t.isBlockStatement(node)) {
        const local = new Map(env);
        const values = new Set<string>();
        for (const statement of node.body) {
          for (const value of evaluate(statement, local, control)) {
            values.add(value);
          }
        }
        return values;
      }
      if (t.isReturnStatement(node)) {
        const values = evaluate(node.argument, env, control);
        if (plan.result) {
          for (const value of [...values, ...control]) {
            edge(value, plan.id + ':return', 'data');
          }
        }
        return values;
      }
      if (t.isVariableDeclarator(node)) {
        const deps = evaluate(node.init, env, control);
        for (const name of Object.keys(t.getBindingIdentifiers(node.id))) {
          env.set(name, deps);
        }
        return deps;
      }
      if (t.isTryStatement(node)) {
        const body = evaluate(node.block, new Map(env), control);
        const guarded = new Set([...control, ...body]);
        const handler = evaluate(node.handler, new Map(env), guarded);
        const finalizer = evaluate(
          node.finalizer,
          new Map(env),
          new Set([...guarded, ...handler]),
        );
        return new Set([...body, ...handler, ...finalizer]);
      }
      if (t.isIfStatement(node) || t.isConditionalExpression(node)) {
        const deps = evaluate(node.test, env, control);
        const guarded = new Set([...control, ...deps]);
        const yes = evaluate(node.consequent, new Map(env), guarded);
        const no = evaluate(node.alternate, new Map(env), guarded);
        return new Set([...deps, ...yes, ...no]);
      }
      if (t.isMemberExpression(node) && !node.computed) {
        return evaluate(node.object, env, control);
      }
      if (t.isObjectProperty(node) && !node.computed) {
        return evaluate(node.value, env, control);
      }
      if (t.isCallExpression(node) && t.isIdentifier(node.callee)) {
        if (
          node.callee.name === runtimeNames.get('each')?.name &&
          t.isFunction(node.arguments[1])
        ) {
          const values = evaluate(node.arguments[0], env, control);
          const callback = node.arguments[1];
          const local = new Map(env);
          for (const param of callback.params) {
            for (const name of Object.keys(t.getBindingIdentifiers(param))) {
              local.set(name, values);
            }
          }
          return new Set([
            ...values,
            ...evaluate(callback.body, local, new Set([...control, ...values])),
          ]);
        }
        const isRead = node.callee.name === runtimeNames.get('read')?.name;
        const runtimePlan = node.callee.name === runtimeNames.get('plan')?.name;
        const target =
          runtimePlan && t.isIdentifier(node.arguments[0])
            ? targets.get(node.arguments[0].name)
            : targets.get(node.callee.name);
        const values = new Set<string>();
        for (const argument of node.arguments) {
          for (const value of evaluate(argument, env, control)) {
            values.add(value);
          }
        }
        if (isRead || target !== undefined) {
          const label = node.arguments[2];
          const id =
            isRead && t.isStringLiteral(label)
              ? label.value
              : `${plan.id}:call:${calls++}`;
          const loc = locations.get(id);
          nodes.set(id, {
            id,
            kind: isRead ? 'read' : 'call',
            ...(isRead ? {managed: managedReads.has(id)} : {}),
            label: isRead ? id : target!.id,
            file,
            line: loc?.start.line ?? null,
            column: loc?.start.column ?? null,
          });
          edge(plan.id, id, 'call');
          for (const from of values) {
            edge(from, id, 'data');
          }
          for (const from of control) {
            edge(from, id, 'control');
          }
          if (target !== undefined) {
            edge(id, target.id, 'call');
          }
          if (target?.result) {
            const result = id + ':result';
            nodes.set(result, {
              id: result,
              kind: 'call',
              label: target.id + ' result',
              file,
              line: null,
              column: null,
            });
            edge(target.id + ':return', result, 'data');
            return new Set([result]);
          }
          return new Set([id]);
        }
        return values;
      }
      const values = new Set<string>();
      for (const key of t.VISITOR_KEYS[node.type] ?? []) {
        const value = (node as unknown as Record<string, unknown>)[key];
        const children = Array.isArray(value) ? value : [value];
        for (const child of children) {
          if (child != null && typeof child === 'object' && 'type' in child) {
            for (const dependency of evaluate(child as t.Node, env, control)) {
              values.add(dependency);
            }
          }
        }
      }
      return values;
    };
    const env = new Map<string, Set<string>>();
    for (const statement of plan.body) {
      evaluate(statement, env, new Set());
    }
  }
  return {nodes: [...nodes.values()], edges: [...edges.values()]};
}

/** Condense recursive plans into components, then score the acyclic dependency graph. */
export function serverPreloadCriticalPaths(
  graph: ServerPreloadDependencyGraph,
): Map<string, Array<string>> {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const children = new Map<string, Set<string>>();
  const parents = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) {
      continue;
    }
    const next = children.get(edge.from) ?? new Set();
    next.add(edge.to);
    children.set(edge.from, next);
    const previous = parents.get(edge.to) ?? new Set();
    previous.add(edge.from);
    parents.set(edge.to, previous);
  }
  const seen = new Set<string>();
  const order: Array<string> = [];
  for (const root of nodes.keys()) {
    const stack: Array<[string, boolean]> = [[root, false]];
    while (stack.length) {
      const [id, done] = stack.pop()!;
      if (done) {
        order.push(id);
        continue;
      }
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      stack.push([id, true]);
      for (const child of children.get(id) ?? []) {
        if (!seen.has(child)) {
          stack.push([child, false]);
        }
      }
    }
  }
  const components: Array<Array<string>> = [];
  const owners = new Map<string, number>();
  for (const root of order.reverse()) {
    if (owners.has(root)) {
      continue;
    }
    const component: Array<string> = [];
    const index = components.length;
    const stack = [root];
    owners.set(root, index);
    while (stack.length) {
      const id = stack.pop()!;
      component.push(id);
      for (const parent of parents.get(id) ?? []) {
        if (!owners.has(parent)) {
          owners.set(parent, index);
          stack.push(parent);
        }
      }
    }
    components.push(component);
  }
  const paths = new Map<number, Array<string>>();
  // Kosaraju discovers components in topological order, so descendants are scored first.
  for (let index = components.length - 1; index >= 0; index--) {
    let best: Array<string> = [];
    for (const id of components[index]) {
      for (const child of children.get(id) ?? []) {
        const owner = owners.get(child)!;
        if (owner === index) {
          continue;
        }
        const candidate = paths.get(owner)!;
        if (candidate.length > best.length) {
          best = candidate;
        }
      }
    }
    paths.set(index, [
      ...components[index].filter(id => nodes.get(id)!.kind === 'read'),
      ...best,
    ]);
  }
  const result = new Map<string, Array<string>>();
  for (const node of graph.nodes) {
    if (node.kind === 'read') {
      const path = paths.get(owners.get(node.id)!)!;
      result.set(node.id, [node.id, ...path.filter(id => id !== node.id)]);
    }
  }
  return result;
}

export function mergeServerPreloadGraphs(
  graphs: Array<ServerPreloadDependencyGraph>,
): ServerPreloadDependencyGraph {
  const nodes = new Map<string, ServerPreloadGraphNode>();
  const edges = new Map<string, ServerPreloadGraphEdge>();
  for (const graph of graphs) {
    for (const node of graph.nodes) {
      nodes.set(node.id, node);
    }
    for (const edge of graph.edges) {
      edges.set(JSON.stringify(edge), edge);
    }
  }
  return {nodes: [...nodes.values()], edges: [...edges.values()]};
}
