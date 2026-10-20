/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {parse} from '@babel/parser';
import traverse from '@babel/traverse';
import {discoverServerReads} from '../Optimization/ServerReadDeclarations';
import {
  buildServerPreloadManifest,
  ServerPreloadManifest,
  ServerPreloadRoute,
} from './ServerPreloadManifest';
import {
  ServerPreloadDependencyGraph,
  mergeServerPreloadGraphs,
  serverPreloadCriticalPaths,
} from './ServerPreloadAnalysis';
import {transformSync, PluginObj, TransformOptions} from '@babel/core';
import * as t from '@babel/types';
import type {PluginOptions} from '../Entrypoint/Options';
import {parsePluginOptions} from '../Entrypoint/Options';
import {compileProgram} from '../Entrypoint/Program';
import type {
  ServerPreloadsOptions,
  ServerPreloadEvent,
} from '../Optimization/ServerPreloads';

export type ServerPreloadSummary = Extract<
  ServerPreloadEvent,
  {kind: 'ServerPreloadSummary'}
>;
export type ServerPreloadResolution =
  | string
  | {id: string; opaque: true}
  | null;

export type ServerPreloadGraphOptions = {
  entryPoints: Array<string>;
  routes?: Array<ServerPreloadRoute>;
  resources?: ServerPreloadsOptions['resources'];
  /** Preserve canonical identity for opaque modules; null means a global external specifier. */
  resolve: (
    specifier: string,
    importer: string,
  ) => Promise<ServerPreloadResolution>;
  load: (id: string) => Promise<string>;
  /** Resource contracts resolve relative to this configuration module ID. */
  resourceBase?: string;
  preloads?: Omit<
    ServerPreloadsOptions,
    'resources' | 'components' | 'localResources'
  >;
  compilerOptions?: PluginOptions;
  parserOptions?: TransformOptions['parserOpts'];
};
export type ServerPreloadDiagnostic = Extract<
  ServerPreloadEvent,
  {kind: 'ServerPreload'}
> & {file: string};
export type CompiledServerPreloadModule = {
  dependencyGraph?: ServerPreloadDependencyGraph;
  diagnostics?: Array<ServerPreloadDiagnostic>;
  code: string;
  map: unknown;
  summaries: Map<string, ServerPreloadSummary>;
  dependencies: Array<string>;
};
export type ServerPreloadGraph = {
  modules: Map<string, CompiledServerPreloadModule>;
  manifest?: ServerPreloadManifest;
  dependencyGraph: ServerPreloadDependencyGraph;
};
type SourceModule = {
  id: string;
  source: string;
  ast: t.File;
  dependencies: Map<string, string | null>;
  excluded: boolean;
  names: Set<string>;
};
type Origin = {id: string; name: string};

function name(node: t.Identifier | t.StringLiteral): string {
  return t.isIdentifier(node) ? node.name : node.value;
}
function originKey(origin: Origin): string {
  return JSON.stringify([origin.id, origin.name]);
}

/**
 * Resolve and analyze a complete build snapshot before emitting any module.
 * Metadata is derived from source, including barrels and cyclic module graphs.
 */
export async function compileServerPreloadGraph(
  options: ServerPreloadGraphOptions,
): Promise<ServerPreloadGraph> {
  const modules = new Map<string, SourceModule>();
  const normalizedOptions = parsePluginOptions(options.compilerOptions ?? {});
  const resolutionId = (resolved: ServerPreloadResolution): string | null =>
    typeof resolved === 'string' ? resolved : (resolved?.id ?? null);
  const parser = (id: string): NonNullable<TransformOptions['parserOpts']> => ({
    sourceType: 'module',
    plugins: /\.[cm]?tsx?$/.test(id)
      ? /\.tsx$/.test(id)
        ? ['typescript', 'jsx']
        : ['typescript']
      : ['jsx', 'flow'],
    ...options.parserOptions,
  });
  const visit = async (id: string): Promise<void> => {
    if (modules.has(id)) {
      return;
    }
    const source = await options.load(id);
    const ast = parse(source, {...parser(id), sourceFilename: id});
    const sources = normalizedOptions.sources;
    const filtered =
      sources != null &&
      (typeof sources === 'function'
        ? !sources(id)
        : !sources.some(prefix => id.startsWith(prefix)));
    const hasModuleSyntax = ast.program.body.some(
      stmt => t.isImportDeclaration(stmt) || t.isExportDeclaration(stmt),
    );
    const excluded =
      filtered ||
      !hasModuleSyntax ||
      ast.program.directives.some(
        d =>
          d.value.value === 'use client' ||
          d.value.value === 'use server' ||
          (!options.compilerOptions?.ignoreUseNoForget &&
            (d.value.value === 'use no memo' ||
              d.value.value === 'use no forget' ||
              options.compilerOptions?.customOptOutDirectives?.includes(
                d.value.value,
              ) === true)),
      );
    const module: SourceModule = {
      id,
      source,
      ast,
      excluded,
      dependencies: new Map(),
      names: new Set(),
    };
    modules.set(id, module);
    const specifiers = new Set<string>();
    for (const stmt of ast.program.body) {
      if (
        t.isImportDeclaration(stmt) &&
        (stmt.importKind == null || stmt.importKind === 'value')
      ) {
        specifiers.add(stmt.source.value);
      }
      if (t.isExportNamedDeclaration(stmt) && stmt.exportKind !== 'type') {
        if (stmt.source != null) {
          specifiers.add(stmt.source.value);
        }
        if (stmt.declaration != null) {
          for (const key of Object.keys(
            t.getBindingIdentifiers(stmt.declaration),
          )) {
            module.names.add(key);
          }
        }
        for (const spec of stmt.specifiers) {
          module.names.add(name(spec.exported));
        }
      } else if (t.isExportAllDeclaration(stmt) && stmt.exportKind !== 'type') {
        specifiers.add(stmt.source.value);
      } else if (t.isExportDefaultDeclaration(stmt)) {
        module.names.add('default');
      }
    }
    /*
     * Sequential discovery gives deterministic diagnostics and handles cycles
     * without two simultaneous loads constructing divergent snapshots.
     */
    for (const specifier of specifiers) {
      const dependency = await options.resolve(specifier, id);
      module.dependencies.set(specifier, resolutionId(dependency));
      if (typeof dependency === 'string' && !excluded) {
        await visit(dependency);
      }
    }
  };
  for (const entry of options.entryPoints) {
    await visit(entry);
  }

  const routeFeatures = parsePluginOptions({
    ...options.compilerOptions,
    outputMode: 'server',
    serverPreloads: {
      ...options.compilerOptions?.serverPreloads,
      ...options.preloads,
      features: {
        ...options.compilerOptions?.serverPreloads?.features,
        ...options.preloads?.features,
      },
      resources: options.resources,
    },
  }).serverPreloads!.features;
  const routeBase = options.resourceBase ?? options.entryPoints[0];
  if (routeFeatures.routeManifests && routeBase !== undefined) {
    for (const route of options.routes ?? []) {
      const id = await options.resolve(route.source, routeBase);
      if (typeof id === 'string') {
        await visit(id);
      }
    }
  }

  // Discover star-export names without treating ambiguity as a declaration.
  let namesChanged = true;
  while (namesChanged) {
    namesChanged = false;
    for (const module of modules.values()) {
      for (const stmt of module.ast.program.body) {
        if (!t.isExportAllDeclaration(stmt) || stmt.exportKind === 'type') {
          continue;
        }
        const target = module.dependencies.get(stmt.source.value);
        const child = target == null ? undefined : modules.get(target);
        if (child === undefined || child.excluded) {
          continue;
        }
        for (const key of child.names) {
          if (key !== 'default' && !module.names.has(key)) {
            module.names.add(key);
            namesChanged = true;
          }
        }
      }
    }
  }

  const importedOrigins = (module: SourceModule): Map<string, Origin> => {
    const result = new Map<string, Origin>();
    for (const stmt of module.ast.program.body) {
      if (
        !t.isImportDeclaration(stmt) ||
        (stmt.importKind != null && stmt.importKind !== 'value')
      ) {
        continue;
      }
      const id =
        module.dependencies.get(stmt.source.value) ??
        'external:' + stmt.source.value;
      for (const spec of stmt.specifiers) {
        if (
          t.isImportNamespaceSpecifier(spec) ||
          (t.isImportSpecifier(spec) &&
            spec.importKind != null &&
            spec.importKind !== 'value')
        ) {
          continue;
        }
        result.set(spec.local.name, {
          id,
          name: t.isImportDefaultSpecifier(spec)
            ? 'default'
            : name(spec.imported),
        });
      }
    }
    return result;
  };
  const resolveOrigin = (
    id: string,
    exported: string,
    seen = new Set<string>(),
  ): Origin | null => {
    const key = originKey({id, name: exported});
    if (seen.has(key)) {
      return null;
    }
    const stack = new Set(seen);
    stack.add(key);
    const module = modules.get(id);
    if (module === undefined) {
      return {id, name: exported};
    }
    if (module.excluded) {
      return {id, name: exported};
    }
    const imported = importedOrigins(module);
    const localOrigin = (
      local: string,
      trail = new Set<string>(),
    ): Origin | null => {
      if (trail.has(local)) {
        return null;
      }
      const next = new Set(trail);
      next.add(local);
      const value = imported.get(local);
      if (value !== undefined) {
        return resolveOrigin(value.id, value.name, stack);
      }
      for (const statement of module.ast.program.body) {
        const declaration = t.isExportNamedDeclaration(statement)
          ? statement.declaration
          : statement;
        if (t.isVariableDeclaration(declaration)) {
          const alias = declaration.declarations.find(item =>
            t.isIdentifier(item.id, {name: local}),
          );
          if (
            alias !== undefined &&
            declaration.kind === 'const' &&
            t.isIdentifier(alias.init)
          ) {
            return localOrigin(alias.init.name, next);
          }
        }
      }
      return {id, name: local};
    };
    for (const stmt of module.ast.program.body) {
      if (t.isExportDefaultDeclaration(stmt) && exported === 'default') {
        if (t.isIdentifier(stmt.declaration)) {
          return localOrigin(stmt.declaration.name);
        }
        if (
          t.isFunctionDeclaration(stmt.declaration) &&
          stmt.declaration.id != null
        ) {
          return localOrigin(stmt.declaration.id.name);
        }
        return {id, name: exported};
      }
      if (!t.isExportNamedDeclaration(stmt) || stmt.exportKind === 'type') {
        continue;
      }
      if (
        stmt.declaration != null &&
        exported in t.getBindingIdentifiers(stmt.declaration)
      ) {
        return localOrigin(exported);
      }
      for (const spec of stmt.specifiers) {
        if (name(spec.exported) !== exported || !t.isExportSpecifier(spec)) {
          continue;
        }
        if (stmt.source != null) {
          return resolveOrigin(
            module.dependencies.get(stmt.source.value) ??
              'external:' + stmt.source.value,
            name(spec.local),
            stack,
          );
        }
        return localOrigin(spec.local.name);
      }
    }
    let origin: Origin | null = null;
    for (const stmt of module.ast.program.body) {
      if (
        !t.isExportAllDeclaration(stmt) ||
        stmt.exportKind === 'type' ||
        exported === 'default'
      ) {
        continue;
      }
      const child = module.dependencies.get(stmt.source.value);
      if (child == null || modules.get(child)?.names.has(exported) !== true) {
        continue;
      }
      const candidate = resolveOrigin(child, exported, stack);
      if (candidate === null) {
        continue;
      }
      if (origin !== null && originKey(origin) !== originKey(candidate)) {
        return null;
      }
      origin = candidate;
    }
    return origin;
  };

  const contracts = new Map<
    string,
    NonNullable<ServerPreloadsOptions['resources']>[number]
  >();
  const resourceBase = options.resourceBase ?? options.entryPoints[0];
  if (resourceBase === undefined) {
    return {modules: new Map(), dependencyGraph: {nodes: [], edges: []}};
  }
  for (const resource of options.resources ?? []) {
    const id = resolutionId(
      await options.resolve(resource.source, resourceBase),
    );
    const origin = resolveOrigin(
      id ?? 'external:' + resource.source,
      resource.importSpecifierName,
    );
    if (origin === null) {
      throw new Error(
        `Ambiguous resource contract ${resource.source}:${resource.importSpecifierName}`,
      );
    }
    const previous = contracts.get(originKey(origin));
    if (
      previous !== undefined &&
      (previous.result ?? 'unknown') !== (resource.result ?? 'unknown')
    ) {
      throw new Error(
        `Conflicting resource result contracts for ${origin.id}:${origin.name}`,
      );
    }
    contracts.set(originKey(origin), resource);
  }
  for (const module of modules.values()) {
    if (module.excluded) continue;
    traverse(module.ast, {
      Program(program) {
        for (const read of discoverServerReads(program, normalizedOptions)) {
          const key = originKey({id: module.id, name: read.name});
          const previous = contracts.get(key);
          if (
            previous !== undefined &&
            (previous.result ?? 'unknown') !== 'unknown' &&
            read.result !== 'unknown' &&
            previous.result !== read.result
          ) {
            throw new Error('Conflicting server read contract: ' + read.name);
          }
          contracts.set(key, {
            source: module.id,
            importSpecifierName: read.name,
            result:
              read.result === 'unknown'
                ? (previous?.result ?? 'unknown')
                : read.result,
          });
        }
        program.stop();
      },
    });
  }
  const metadata = new Map<string, Map<string, ServerPreloadSummary>>();
  const compile = (
    module: SourceModule,
    analyze: boolean,
    forward: Map<string, ServerPreloadSummary>,
    criticalPaths?: Map<string, Array<string>>,
  ): CompiledServerPreloadModule => {
    if (module.excluded) {
      return {
        code: module.source,
        map: null,
        summaries: new Map(),
        dependencies: Array.from(module.dependencies.values()).filter(
          (id): id is string => id !== null,
        ),
      };
    }
    const resources: ServerPreloadsOptions['resources'] = [];
    const components: NonNullable<ServerPreloadsOptions['components']> = [];
    for (const stmt of module.ast.program.body) {
      if (
        !t.isImportDeclaration(stmt) ||
        (stmt.importKind != null && stmt.importKind !== 'value')
      ) {
        continue;
      }
      const id =
        module.dependencies.get(stmt.source.value) ??
        'external:' + stmt.source.value;
      for (const spec of stmt.specifiers) {
        if (
          t.isImportNamespaceSpecifier(spec) ||
          (t.isImportSpecifier(spec) &&
            spec.importKind != null &&
            spec.importKind !== 'value')
        ) {
          continue;
        }
        const imported = t.isImportDefaultSpecifier(spec)
          ? 'default'
          : name(spec.imported);
        const origin = resolveOrigin(id, imported);
        const contract =
          origin === null ? undefined : contracts.get(originKey(origin));
        if (
          contract !== undefined &&
          !resources.some(
            entry =>
              entry.source === stmt.source.value &&
              entry.importSpecifierName === imported,
          )
        ) {
          resources.push({
            ...contract,
            source: stmt.source.value,
            importSpecifierName: imported,
          });
        }
        const summary = metadata.get(id)?.get(imported);
        if (
          summary !== undefined &&
          contract === undefined &&
          !components.some(
            entry =>
              entry.source === stmt.source.value &&
              entry.importSpecifierName === imported,
          )
        ) {
          components.push({
            source: stmt.source.value,
            importSpecifierName: imported,
            preload: summary.preload,
            requiresData: summary.requiresData ?? false,
            ...(summary.dataPreload === undefined
              ? {}
              : {dataPreload: summary.dataPreload}),
            ...(summary.planId === undefined ? {} : {planId: summary.planId}),
            props: summary.props,
            functionKind: summary.functionKind ?? 'component',
            complete: summary.complete ?? false,
            result: summary.result ?? 'unknown',
          });
        }
      }
    }
    const localResources: NonNullable<ServerPreloadsOptions['localResources']> =
      [];
    for (const exported of module.names) {
      const origin = resolveOrigin(module.id, exported);
      const contract =
        origin === null ? undefined : contracts.get(originKey(origin));
      if (contract === undefined) {
        continue;
      }
      for (const node of module.ast.program.body) {
        let local: string | null = null;
        if (
          t.isExportNamedDeclaration(node) &&
          node.source == null &&
          node.exportKind !== 'type'
        ) {
          if (
            node.declaration != null &&
            exported in t.getBindingIdentifiers(node.declaration)
          ) {
            local = exported;
          }
          const spec = node.specifiers.find(
            spec =>
              t.isExportSpecifier(spec) && name(spec.exported) === exported,
          );
          if (spec !== undefined && t.isExportSpecifier(spec)) {
            local = spec.local.name;
          }
        } else if (
          t.isExportDefaultDeclaration(node) &&
          exported === 'default'
        ) {
          local = t.isIdentifier(node.declaration)
            ? node.declaration.name
            : t.isFunctionDeclaration(node.declaration) &&
                node.declaration.id != null
              ? node.declaration.id.name
              : 'default';
        }
        if (
          local !== null &&
          !localResources.some(entry => entry.name === local)
        ) {
          localResources.push({
            name: local,
            result: contract.result ?? 'unknown',
          });
        }
      }
    }
    let dependencyGraph: ServerPreloadDependencyGraph = {nodes: [], edges: []};
    const diagnostics: Array<ServerPreloadDiagnostic> = [];
    const summaries = new Map<string, ServerPreloadSummary>();
    const base = options.compilerOptions ?? {};
    const opts = parsePluginOptions({
      ...base,
      outputMode: 'server',
      serverPreloads: {
        ...base.serverPreloads,
        ...options.preloads,
        features: {
          ...base.serverPreloads?.features,
          ...options.preloads?.features,
        },
        resources,
        localResources,
        components,
        mode: analyze
          ? 'analyze'
          : (options.preloads?.mode ?? base.serverPreloads?.mode ?? 'compile'),
      },
      logger: {
        logEvent(filename: string | null, event: ServerPreloadEvent) {
          if (event.kind === 'ServerPreloadGraph') {
            dependencyGraph = event.graph;
          }
          if (event.kind === 'ServerPreload') {
            diagnostics.push({...event, file: module.id});
          }
          if (event.kind === 'ServerPreloadSummary') {
            summaries.set(event.component, event);
          }
          if (!analyze) {
            base.logger?.logEvent(filename, event);
          }
        },
      },
    });
    const plugin: PluginObj = {
      visitor: {
        Program(path) {
          compileProgram(path, {
            opts,
            ...(criticalPaths === undefined
              ? {}
              : {serverPreloadCriticalPaths: criticalPaths}),
            filename: module.id,
            comments: module.ast.comments ?? [],
            code: module.source,
          });
          if (
            !analyze &&
            !base.noEmit &&
            opts.serverPreloads?.mode !== 'analyze' &&
            (opts.serverPreloads?.features.preloading ||
              opts.serverPreloads?.features.routeManifests) &&
            !module.excluded
          ) {
            for (const [exported, summary] of forward) {
              if (summaries.has(exported)) {
                continue;
              }
              const origin = resolveOrigin(module.id, exported);
              let edge: {source: string; summary: ServerPreloadSummary} | null =
                null;
              for (const [specifier, id] of module.dependencies) {
                if (id === null || origin === null) {
                  continue;
                }
                for (const [name, candidate] of metadata.get(id) ?? []) {
                  const target = resolveOrigin(id, name);
                  if (
                    target !== null &&
                    originKey(target) === originKey(origin)
                  ) {
                    edge = {source: specifier, summary: candidate};
                    break;
                  }
                }
                if (edge !== null) {
                  break;
                }
              }
              if (edge === null) {
                continue;
              }
              const dependencySummary = edge.summary;
              for (const [dependencyName, exportName] of [
                [dependencySummary.preload, summary.preload],
                ...(dependencySummary.dataPreload !== undefined &&
                summary.dataPreload !== undefined
                  ? [
                      [
                        dependencySummary.dataPreload.preload,
                        summary.dataPreload.preload,
                      ],
                    ]
                  : []),
              ]) {
                const alias =
                  path.scope.generateUidIdentifier('forwardPreload');
                path.unshiftContainer(
                  'body',
                  t.importDeclaration(
                    [
                      t.importSpecifier(
                        alias,
                        t.isValidIdentifier(dependencyName)
                          ? t.identifier(dependencyName)
                          : t.stringLiteral(dependencyName),
                      ),
                    ],
                    t.stringLiteral(edge.source),
                  ),
                );
                path.pushContainer(
                  'body',
                  t.exportNamedDeclaration(null, [
                    t.exportSpecifier(
                      t.cloneNode(alias),
                      t.isValidIdentifier(exportName)
                        ? t.identifier(exportName)
                        : t.stringLiteral(exportName),
                    ),
                  ]),
                );
              }
            }
          }
        },
      },
    };
    const transformed = transformSync(module.source, {
      filename: module.id,
      configFile: false,
      babelrc: false,
      parserOpts: parser(module.id),
      plugins: [plugin],
      sourceMaps: true,
      sourceFileName: module.id,
    });
    if (transformed?.code == null) {
      throw new Error(`Failed to emit server preload module ${module.id}`);
    }
    return {
      code: transformed.code,
      map: transformed.map,
      dependencyGraph,
      diagnostics,
      summaries,
      dependencies: Array.from(module.dependencies.values()).filter(
        (id): id is string => id !== null,
      ),
    };
  };

  const forwards = (
    module: SourceModule,
  ): Map<string, ServerPreloadSummary> => {
    const result = new Map<string, ServerPreloadSummary>();
    if (module.excluded) {
      return result;
    }
    for (const exported of module.names) {
      const origin = resolveOrigin(module.id, exported);
      if (
        origin === null ||
        origin.id === module.id ||
        module.names.has('__reactPreload_' + exported)
      ) {
        continue;
      }
      const summary = Array.from(metadata.get(origin.id) ?? []).find(
        ([name]) => {
          const target = resolveOrigin(origin.id, name);
          return target !== null && originKey(target) === originKey(origin);
        },
      )?.[1];
      if (summary !== undefined) {
        result.set(exported, {
          ...summary,
          fnLoc: null,
          component: exported,
          preload: '__reactPreload_' + exported,
          ...(summary.dataPreload === undefined ||
          module.names.has('__reactPreloadData_' + exported)
            ? {dataPreload: undefined}
            : {
                dataPreload: {
                  ...summary.dataPreload,
                  preload: '__reactPreloadData_' + exported,
                },
              }),
        });
      }
    }
    return result;
  };
  /*
   * Header/return-shape summaries form a finite fixed point. Detect an actual
   * oscillation rather than emitting stale or guessed metadata for a cycle.
   */
  const states = new Set<string>();
  for (;;) {
    const before = JSON.stringify(
      Array.from(metadata, ([id, values]) => [id, Array.from(values)]),
    );
    if (states.has(before)) {
      throw new Error('Server preload module summaries did not converge');
    }
    states.add(before);
    for (const module of modules.values()) {
      const forwarded = forwards(module);
      const result = compile(module, true, forwarded);
      metadata.set(module.id, new Map([...forwarded, ...result.summaries]));
    }
    const after = JSON.stringify(
      Array.from(metadata, ([id, values]) => [id, Array.from(values)]),
    );
    if (before === after) {
      break;
    }
  }
  const analyzed = Array.from(modules.values(), module =>
    compile(module, true, forwards(module)),
  );
  const dependencyGraph = mergeServerPreloadGraphs(
    analyzed.flatMap(module =>
      module.dependencyGraph === undefined ? [] : [module.dependencyGraph],
    ),
  );
  const criticalPaths = serverPreloadCriticalPaths(dependencyGraph);
  const output = new Map<string, CompiledServerPreloadModule>();
  for (const module of modules.values()) {
    const forwarded = forwards(module);
    const result = compile(module, false, forwarded, criticalPaths);
    result.summaries = new Map([...forwarded, ...result.summaries]);
    output.set(module.id, result);
  }
  const graph: ServerPreloadGraph = {modules: output, dependencyGraph};
  if (
    routeFeatures.routeManifests &&
    routeBase !== undefined &&
    !options.compilerOptions?.noEmit &&
    (options.preloads?.mode ??
      options.compilerOptions?.serverPreloads?.mode) !== 'analyze'
  ) {
    graph.manifest = await buildServerPreloadManifest(
      graph,
      options.routes ?? [],
      options.resolve,
      routeBase,
    );
  }
  return graph;
}
