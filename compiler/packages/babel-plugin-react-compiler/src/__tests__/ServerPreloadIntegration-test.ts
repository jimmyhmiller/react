/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import * as esbuild from 'esbuild';
import {serverPreloadsEsbuildPlugin} from '../Server/ServerPreloadsEsbuildPlugin';

const nodeModules = path.resolve(__dirname, '../../../../node_modules');
const execute = promisify(execFile);

it.each([
  {mode: 'configured', record: false},
  {mode: 'declared', record: false},
  {mode: 'configured', record: true},
  {mode: 'declared', record: true},
])(
  'bundles $mode reads with record=$record and renders them through actual Flight',
  async ({mode, record}) => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'react-server-preloads-'),
    );
    try {
      await Promise.all(
        Object.entries({
          'entry.jsx': `export {Page} from './Page';`,
          'Page.jsx': `import React, {Suspense} from 'react'; import {getProduct, getFlags} from './data'; import {Comments} from './barrel';
        export async function Page({id}) {
          const product = await getProduct(id);
          const flags = await getFlags(id);
          return <><h1>{product.name}</h1><Suspense fallback={<p>loading</p>}><Comments ${record ? 'product={product}' : 'id={product.sellerId}'}/></Suspense></>;
        }`,
          'barrel.js': `export {Seller as Comments} from './Seller';`,
          'Seller.jsx': `import React from 'react'; import {loadSeller} from './helper'; import {getReviews} from './data';
        export async function Seller(${record ? '{product}' : '{id}'}) {const seller = await loadSeller(${record ? 'product.sellerId' : 'id'}); const reviews = await getReviews(seller.reviewId); return <div>{reviews}</div>;}`,
          'helper.js': `import {getSeller} from './data'; export async function loadSeller(id) {const seller = await getSeller(id); return seller;}`,
          'data.js':
            mode === 'configured'
              ? `import {cache} from 'react';
        export const getProduct = cache(id => globalThis.__preloadFlightData.getProduct(id));
        export const getFlags = cache(id => globalThis.__preloadFlightData.getFlags(id));
        export const getSeller = cache(id => globalThis.__preloadFlightData.getSeller(id));
        export const getReviews = cache(id => globalThis.__preloadFlightData.getReviews(id));`
              : `import {createServerRead} from 'react-compiler-runtime/server';
        export const getProduct = createServerRead(id => globalThis.__preloadFlightData.getProduct(id), {result:'immutable-data'});
        export const getFlags = createServerRead(id => globalThis.__preloadFlightData.getFlags(id), {result:'primitive'});
        export const getSeller = createServerRead(id => globalThis.__preloadFlightData.getSeller(id), {result:'immutable-data'});
        export const getReviews = createServerRead(id => globalThis.__preloadFlightData.getReviews(id), {result:'primitive'});`,
        }).map(([name, source]) =>
          writeFile(path.join(directory, name), source),
        ),
      );
      const bundle = path.join(directory, 'server.cjs');
      await esbuild.build({
        absWorkingDir: directory,
        entryPoints: ['./entry.jsx'],
        outfile: bundle,
        platform: 'node',
        format: 'cjs',
        bundle: true,
        external: ['react', 'react-compiler-runtime/server'],
        nodePaths: [nodeModules],
        plugins: [
          serverPreloadsEsbuildPlugin({
            resources:
              mode === 'declared'
                ? []
                : [
                    {
                      source: './data',
                      importSpecifierName: 'getProduct',
                      result: 'immutable-data',
                    },
                    {
                      source: './data',
                      importSpecifierName: 'getFlags',
                      result: 'primitive',
                    },
                    {
                      source: './data',
                      importSpecifierName: 'getSeller',
                      result: 'immutable-data',
                    },
                    {
                      source: './data',
                      importSpecifierName: 'getReviews',
                      result: 'primitive',
                    },
                  ],
          }),
        ],
      });
      const {stdout, stderr} = await execute(
        process.execPath,
        [
          '--conditions=react-server',
          path.join(__dirname, 'fixtures/server-preloads-flight.cjs'),
          bundle,
        ],
        {
          env: {
            ...process.env,
            NODE_PATH: [nodeModules, process.env['NODE_PATH']]
              .filter(Boolean)
              .join(path.delimiter),
          },
          timeout: 15000,
        },
      );
      expect(stdout).toContain('PASS Flight graph');
      expect(stderr).toBe('');
    } finally {
      await rm(directory, {recursive: true, force: true});
    }
  },
  25000,
);

it('rebuilds after a resource-bearing child changes without reusing stale metadata', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'react-preload-rebuild-'),
  );
  let context: esbuild.BuildContext | undefined;
  const analyses: Array<string> = [];
  try {
    await writeFile(
      path.join(directory, 'Page.jsx'),
      `import {getProduct} from 'data'; import {Child} from './Child'; export async function Page({id}) {const product=await getProduct(id); return <Child id={id}/>;}`,
    );
    await writeFile(
      path.join(directory, 'Child.jsx'),
      `export function Child({id}) {return <div/>;}`,
    );
    context = await esbuild.context({
      absWorkingDir: directory,
      entryPoints: ['./Page.jsx'],
      platform: 'node',
      format: 'cjs',
      bundle: true,
      write: false,
      external: ['data', 'react-compiler-runtime/server'],
      nodePaths: [nodeModules],
      plugins: [
        serverPreloadsEsbuildPlugin({
          resources: [
            {source: 'data', importSpecifierName: 'getProduct'},
            {source: 'data', importSpecifierName: 'getReviews'},
          ],
          onAnalysis: graph => {
            analyses.push(JSON.stringify(graph.dependencyGraph));
          },
        }),
      ],
    });
    const first = await context.rebuild();
    expect(first.outputFiles![0].text).not.toContain('getReviews');
    await writeFile(
      path.join(directory, 'Child.jsx'),
      `import {getReviews} from 'data'; export async function Child({id}) {const reviews=await getReviews(id); return <div>{reviews}</div>;}`,
    );
    const second = await context.rebuild();
    expect(second.outputFiles![0].text).toContain('getReviews');
    expect(second.outputFiles![0].text).toContain('preloadChild');
    expect(analyses).toHaveLength(2);
    expect(analyses[0]).not.toContain('getReviews');
    expect(analyses[1]).toContain('getReviews');
  } finally {
    await context?.dispose();
    await rm(directory, {recursive: true, force: true});
  }
}, 25000);

it('keeps the client runtime bundle free of server request machinery', async () => {
  const result = await esbuild.build({
    stdin: {
      contents: `export {c} from 'react-compiler-runtime';`,
      resolveDir: path.resolve(__dirname, '../..'),
    },
    platform: 'browser',
    bundle: true,
    write: false,
    external: ['react'],
    nodePaths: [nodeModules],
  });
  expect(result.outputFiles[0].text).not.toContain('node:async_hooks');
  expect(result.outputFiles[0].text).not.toContain('ServerPreloadScheduler');
});

it.each(['cjs', 'js'])(
  'keeps opaque %s resources distinct through the actual bundler resolver',
  async extension => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'react-preload-opaque-'),
    );
    try {
      await Promise.all([
        writeFile(
          path.join(directory, 'Page.jsx'),
          `import {read} from './first.${extension}'; import {Other} from './Other'; export async function Page({id}) {await read(id); return <Other id={id}/>;}`,
        ),
        writeFile(
          path.join(directory, 'Other.jsx'),
          `import {read} from './second.${extension}'; export async function Other({id}) {await read(id); return <div/>;}`,
        ),
        writeFile(
          path.join(directory, `first.${extension}`),
          `exports.read=id=>Promise.resolve(id);`,
        ),
        writeFile(
          path.join(directory, `second.${extension}`),
          `exports.read=id=>Promise.resolve(id);`,
        ),
      ]);
      const result = await esbuild.build({
        absWorkingDir: directory,
        entryPoints: ['./Page.jsx'],
        platform: 'node',
        format: 'cjs',
        bundle: true,
        write: false,
        external: ['react-compiler-runtime/server'],
        plugins: [
          serverPreloadsEsbuildPlugin({
            resources: [
              {source: `./first.${extension}`, importSpecifierName: 'read'},
            ],
            include: id => id.endsWith('.jsx'),
          }),
        ],
      });
      expect(result.outputFiles[0].text).toContain('__reactPreload_Page');
      expect(result.outputFiles[0].text).not.toContain('__reactPreload_Other');
    } finally {
      await rm(directory, {recursive: true, force: true});
    }
  },
);

it.each(['bulk-resource', 'unified-read'])(
  'batches %s reads from twenty distinct Server Component instances into one backend operation',
  async api => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'react-preload-batch-flight-'),
    );
    try {
      await Promise.all(
        Object.entries({
          'Page.jsx': `import React from 'react'; import {Author} from './Author'; export function Page() {return <>${Array.from({length: 20}, (_, id) => `<Author id={${id}}/>`).join('')}</>;}`,
          'Author.jsx': `import React from 'react'; import {getUser} from './data'; export async function Author({id}) {const user=await getUser(id); return <span>{user.name}</span>;}`,
          'data.js':
            api === 'bulk-resource'
              ? `import {createBatchedResource} from 'react-compiler-runtime/server'; export const getUser=createBatchedResource(async keys=>{globalThis.__batches.push(keys.map(([id])=>id)); return keys.map(([id])=>({status:'fulfilled',value:{name:'AUTHOR_'+id}}));}, {result:'immutable-data'});`
              : `import {createServerRead} from 'react-compiler-runtime/server'; export const getUser=createServerRead(async id=>{throw new Error('single loader must not run when batching is enabled');}, {result:'immutable-data', async batch(keys) {globalThis.__batches.push(keys.map(([id])=>id)); return keys.map(([id])=>({status:'fulfilled',value:{name:'AUTHOR_'+id}}));}});`,
        }).map(([name, source]) =>
          writeFile(path.join(directory, name), source),
        ),
      );
      const bundle = path.join(directory, 'server.cjs');
      await esbuild.build({
        absWorkingDir: directory,
        entryPoints: ['./Page.jsx'],
        outfile: bundle,
        platform: 'node',
        format: 'cjs',
        bundle: true,
        external: ['react', 'react-compiler-runtime/server'],
        nodePaths: [nodeModules],
        plugins: [serverPreloadsEsbuildPlugin()],
      });
      const {stdout, stderr} = await execute(
        process.execPath,
        [
          '--conditions=react-server',
          path.join(__dirname, 'fixtures/server-preloads-batch-flight.cjs'),
          bundle,
        ],
        {
          env: {
            ...process.env,
            NODE_PATH: [nodeModules, process.env['NODE_PATH']]
              .filter(Boolean)
              .join(path.delimiter),
          },
          timeout: 15000,
        },
      );
      expect(stdout).toContain('PASS Flight batch');
      expect(stderr).toBe('');
    } finally {
      await rm(directory, {recursive: true, force: true});
    }
  },
  25000,
);

it('keeps the published compiler entrypoint free of the Node-only esbuild adapter', async () => {
  const result = await esbuild.build({
    entryPoints: [path.resolve(__dirname, '../../dist/index.js')],
    platform: 'browser',
    bundle: true,
    write: false,
    packages: 'external',
    metafile: true,
  });
  const imports = Object.values(result.metafile!.outputs).flatMap(output =>
    output.imports.map(item => item.path),
  );
  expect(imports).not.toContain('node:fs/promises');
  expect(imports).not.toContain('node:path');
  // Existing Babel helpers use the playground's fs/path fallbacks; the adapter adds Node-prefixed imports.
  const compiler = require('../../dist');
  expect(compiler.serverPreloadsEsbuildPlugin).toBeUndefined();
  expect(compiler.compileServerPreloadGraph).toBeUndefined();
  const adapter = require('../../esbuild');
  expect(typeof adapter.serverPreloadsEsbuildPlugin).toBe('function');
});

it.each(['configured', 'unified-batch'])(
  'shares %s manifest reads and relocates only opted-in consumption through Flight',
  async api => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'react-preload-route-flight-'),
    );
    try {
      await Promise.all(
        Object.entries({
          'entry.js': `export {Page, PageCatch} from './Page'; export {default as manifest} from 'react:server-preload-manifest';`,
          'Page.jsx': `import React, {Suspense} from 'react'; import {getReviews} from './data';
        export async function Page({id}) {'use defer to suspense'; const reviews=await getReviews(id); return <><h1>SHELL</h1><Suspense fallback={<p>LOADING</p>}><Reviews reviews={reviews}/></Suspense></>;}
        export async function PageCatch({id}) {'use defer to suspense'; try {const reviews=await getReviews(id); return <Suspense><Reviews reviews={reviews}/></Suspense>;} catch(error) {return <p>CAUGHT</p>;}}
        function Reviews({reviews}) {return <p>{reviews}</p>;}`,
          'data.js':
            api === 'configured'
              ? `import {cache} from 'react'; export const getReviews=cache(id=>globalThis.__routeRead(id));`
              : `import {createServerRead} from 'react-compiler-runtime/server'; export const getReviews=createServerRead(id=>globalThis.__routeRead(id), {result:'primitive', async batch(keys) {return Promise.all(keys.map(async ([id])=>{try {return {status:'fulfilled', value:await globalThis.__routeRead(id)};} catch(reason) {return {status:'rejected',reason};}}));}});`,
        }).map(([name, source]) =>
          writeFile(path.join(directory, name), source),
        ),
      );
      const bundle = path.join(directory, 'server.cjs');
      await esbuild.build({
        absWorkingDir: directory,
        entryPoints: ['./entry.js'],
        outfile: bundle,
        platform: 'node',
        format: 'cjs',
        bundle: true,
        external: ['react', 'react-compiler-runtime/server'],
        nodePaths: [nodeModules],
        plugins: [
          serverPreloadsEsbuildPlugin({
            resources:
              api === 'configured'
                ? [
                    {
                      source: './data',
                      importSpecifierName: 'getReviews',
                      result: 'primitive',
                    },
                  ]
                : [],
            routes: [{id: 'reviews', source: './Page.jsx', exportName: 'Page'}],
            preloads: {features: {routeManifests: true, deferAwait: true}},
          }),
        ],
      });
      const {stdout, stderr} = await execute(
        process.execPath,
        [
          '--conditions=react-server',
          path.join(__dirname, 'fixtures/server-preloads-route-flight.cjs'),
          bundle,
        ],
        {
          env: {
            ...process.env,
            NODE_PATH: [nodeModules, process.env['NODE_PATH']]
              .filter(Boolean)
              .join(path.delimiter),
          },
          timeout: 15000,
        },
      );
      expect(stdout).toContain('PASS Flight route/deferred');
      expect(stderr).toBe('');
    } finally {
      await rm(directory, {recursive: true, force: true});
    }
  },
  25000,
);
