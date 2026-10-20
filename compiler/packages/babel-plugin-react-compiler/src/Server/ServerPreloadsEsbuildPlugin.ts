/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {readFile} from 'node:fs/promises';
import {emitServerPreloadManifestModule} from './ServerPreloadManifest';
import {mergeServerPreloadGraphs} from './ServerPreloadAnalysis';
import path from 'node:path';
import type {Plugin, Loader, PluginBuild} from 'esbuild';
import {
  compileServerPreloadGraph,
  ServerPreloadGraph,
  ServerPreloadGraphOptions,
  ServerPreloadResolution,
} from './CompileServerPreloadGraph';

export type ServerPreloadsEsbuildOptions = {
  resources?: ServerPreloadGraphOptions['resources'];
  routes?: ServerPreloadGraphOptions['routes'];
  preloads?: ServerPreloadGraphOptions['preloads'];
  compilerOptions?: ServerPreloadGraphOptions['compilerOptions'];
  parserOptions?: ServerPreloadGraphOptions['parserOptions'];
  /** Defaults to file modules outside node_modules. */
  include?: (absolutePath: string) => boolean;
  /** Receives fresh dependency/diagnostic data after each successful build. */
  onAnalysis?: (graph: ServerPreloadGraph) => void | Promise<void>;
};

function loader(id: string): Loader {
  return /\.tsx$/.test(id) ? 'tsx' : /\.[cm]?ts$/.test(id) ? 'ts' : 'jsx';
}

/**
 * Build-snapshot adapter: resolves through esbuild (including aliases), derives
 * plans to a fixed point, and supplies transformed modules and original maps.
 */
export function serverPreloadsEsbuildPlugin(
  options: ServerPreloadsEsbuildOptions = {},
): Plugin {
  return {
    name: 'react-server-preloads',
    setup(build: PluginBuild): void {
      const runtime =
        options.preloads !== undefined && 'runtime' in options.preloads
          ? options.preloads.runtime
          : options.compilerOptions?.serverPreloads?.runtime;
      if (
        build.initialOptions.platform !== 'node' &&
        runtime !== null &&
        (runtime === undefined || runtime === 'react-compiler-runtime/server')
      ) {
        throw new Error(
          'React server preloads require platform: "node" or an explicitly configured portable server runtime',
        );
      }
      let graph: ServerPreloadGraph = {
        modules: new Map(),
        dependencyGraph: {nodes: [], edges: []},
      };
      const directory = build.initialOptions.absWorkingDir ?? process.cwd();
      const include =
        options.include ??
        ((id: string): boolean => !id.split(path.sep).includes('node_modules'));
      const resolve = async (
        specifier: string,
        importer: string,
      ): Promise<ServerPreloadResolution> => {
        const result = await build.resolve(specifier, {
          importer,
          resolveDir: path.dirname(importer),
          kind: 'import-statement',
        });
        if (result.errors.length !== 0) {
          throw new Error(result.errors.map(error => error.text).join('\n'));
        }
        if (result.external) {
          return {
            id: result.path.startsWith('.')
              ? path.resolve(path.dirname(importer), result.path)
              : result.path,
            opaque: true,
          };
        }
        if (
          result.namespace !== 'file' ||
          !/\.m?[jt]sx?$/.test(result.path) ||
          !include(result.path)
        ) {
          return {
            id:
              result.namespace === 'file'
                ? result.path
                : result.namespace + ':' + result.path,
            opaque: true,
          };
        }
        return result.path;
      };
      const compile = (entries: Array<string>): Promise<ServerPreloadGraph> =>
        compileServerPreloadGraph({
          entryPoints: entries,
          ...(options.routes === undefined ? {} : {routes: options.routes}),
          resources: options.resources,
          resourceBase: path.join(
            directory,
            '__react_preload_configuration__.js',
          ),
          resolve,
          load: id => readFile(id, 'utf8'),
          ...(options.preloads === undefined
            ? {}
            : {preloads: options.preloads}),
          ...(options.compilerOptions === undefined
            ? {}
            : {compilerOptions: options.compilerOptions}),
          ...(options.parserOptions === undefined
            ? {}
            : {parserOptions: options.parserOptions}),
        });
      build.onResolve({filter: /^react:server-preload-manifest$/}, () => ({
        path: 'manifest',
        namespace: 'react-server-preload-manifest',
      }));
      build.onLoad(
        {filter: /.*/, namespace: 'react-server-preload-manifest'},
        () => ({
          contents: emitServerPreloadManifestModule(
            graph.manifest ?? {version: 1, routes: []},
            runtime ?? 'react-compiler-runtime/server',
          ),
          loader: 'js',
          resolveDir: directory,
        }),
      );
      build.onStart(async () => {
        const raw = build.initialOptions.entryPoints ?? [];
        const entries = Array.isArray(raw)
          ? raw.map(entry => (typeof entry === 'string' ? entry : entry.in))
          : Object.values(raw);
        const resolved: Array<string> = [];
        for (const entry of entries) {
          const id = await resolve(
            path.isAbsolute(entry) ? entry : './' + entry,
            path.join(directory, '__react_preload_entry__.js'),
          );
          if (typeof id === 'string') {
            resolved.push(id);
          }
        }
        graph = await compile(resolved);
      });
      build.onEnd(async result => {
        if (result.errors.length === 0 && options.onAnalysis !== undefined) {
          graph.dependencyGraph = mergeServerPreloadGraphs(
            Array.from(graph.modules.values()).flatMap(module =>
              module.dependencyGraph === undefined
                ? []
                : [module.dependencyGraph],
            ),
          );
          await options.onAnalysis(graph);
        }
      });
      build.onLoad({filter: /\.m?[jt]sx?$/, namespace: 'file'}, async args => {
        if (!include(args.path)) {
          return undefined;
        }
        let module = graph.modules.get(args.path);
        if (module === undefined) {
          /*
           * Code-split/dynamic entrypoints are analyzed as new snapshots; no
           * opaque parent is speculated through to discover them.
           */
          const extra = await compile([args.path]);
          for (const [id, value] of extra.modules) {
            graph.modules.set(id, value);
          }
          module = graph.modules.get(args.path);
        }
        if (module === undefined) {
          return undefined;
        }
        const map =
          module.map == null
            ? ''
            : '\n//# sourceMappingURL=data:application/json;base64,' +
              Buffer.from(JSON.stringify(module.map)).toString('base64');
        return {
          contents: module.code + map,
          loader: loader(args.path),
          resolveDir: path.dirname(args.path),
          watchFiles: [args.path, ...module.dependencies],
        };
      });
    },
  };
}
