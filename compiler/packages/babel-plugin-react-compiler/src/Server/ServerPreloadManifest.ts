/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {
  ServerPreloadGraph,
  ServerPreloadGraphOptions,
} from './CompileServerPreloadGraph';

export type ServerPreloadRoute = {
  id: string;
  source: string;
  exportName: string;
};
export type ServerPreloadManifest = {
  version: 1;
  routes: Array<{
    id: string;
    module: string;
    exportName: string;
    preload: string;
    props: Array<string>;
  }>;
};

/** Pre-render reads must have original consumers in the same request scheduler. */
export async function buildServerPreloadManifest(
  graph: ServerPreloadGraph,
  routes: Array<ServerPreloadRoute>,
  resolve: ServerPreloadGraphOptions['resolve'],
  base: string,
): Promise<ServerPreloadManifest> {
  const result: ServerPreloadManifest = {version: 1, routes: []};
  const seen = new Set<string>();
  const nodes = new Map(
    graph.dependencyGraph.nodes.map(node => [node.id, node]),
  );
  const edges = new Map<string, Array<string>>();
  for (const edge of graph.dependencyGraph.edges) {
    const children = edges.get(edge.from) ?? [];
    children.push(edge.to);
    edges.set(edge.from, children);
  }
  for (const route of routes) {
    if (seen.has(route.id)) {
      throw new Error(`Duplicate preload route: ${route.id}`);
    }
    seen.add(route.id);
    const id = await resolve(route.source, base);
    const module = typeof id === 'string' ? graph.modules.get(id) : undefined;
    const summary = module?.summaries.get(route.exportName);
    if (
      typeof id !== 'string' ||
      summary == null ||
      summary.functionKind !== 'component' ||
      summary.planId == null
    ) {
      throw new Error(
        `Route ${route.id} has no safe Server Component preload companion`,
      );
    }
    const visited = new Set<string>();
    const pending = [summary.planId];
    while (pending.length !== 0) {
      const node = pending.pop()!;
      if (visited.has(node)) {
        continue;
      }
      visited.add(node);
      const value = nodes.get(node);
      if (value?.kind === 'read' && value.managed !== true) {
        throw new Error(
          `Route ${route.id} cannot preload before rendering: ${value.label} has an unmanaged original consumer; await the read directly`,
        );
      }
      pending.push(...(edges.get(node) ?? []));
    }
    result.routes.push({
      id: route.id,
      module: id,
      exportName: route.exportName,
      preload: summary.preload,
      props: [...summary.props],
    });
  }
  return result;
}

/** Specifiers and route IDs are emitted as JSON literals, never executable text. */
export function emitServerPreloadManifestModule(
  manifest: ServerPreloadManifest,
  runtime = 'react-compiler-runtime/server',
): string {
  if (manifest.routes.length === 0) {
    return 'export const manifest=Object.freeze({routes:Object.freeze([]),preload(){return false;}});export default manifest;';
  }
  return [
    `import {createRoutePreloadManifest} from ${JSON.stringify(runtime)};`,
    ...manifest.routes.map(
      (route, index) =>
        `import {${JSON.stringify(route.preload)} as plan${index}} from ${JSON.stringify(route.module)};`,
    ),
    `export const manifest=createRoutePreloadManifest([${manifest.routes.map((route, index) => `{id:${JSON.stringify(route.id)},props:${JSON.stringify(route.props)},preload:plan${index}}`).join(',')}]);`,
    'export default manifest;',
  ].join('\n');
}
