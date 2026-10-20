/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

const assert = require('node:assert/strict');
const {mkdtemp, writeFile, rm} = require('node:fs/promises');
const {tmpdir} = require('node:os');
const path = require('node:path');
const {PassThrough} = require('node:stream');
const esbuild = require('esbuild');
const React = require('react');
const {
  renderToPipeableStream,
} = require('react-server-dom-webpack/server.node');
const {
  createServerPreloadRequest,
  createServerPreloadTrace,
} = require('react-compiler-runtime/server');
const {renderServerPreloadLens} = require('../dist');
const {serverPreloadsEsbuildPlugin} = require('../esbuild');

(async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'react-preload-lens-'));
  const destination = path.resolve(
    process.argv[2] ?? path.join(tmpdir(), 'react-server-preload-lens.html')
  );
  try {
    const sources = {
      'Page.jsx': `import React, {Suspense} from 'react'; import {getProduct, getFlags} from './data'; import {Seller} from './Seller'; import {Authors} from './Authors';
export async function Page({id}) {
  const product = await getProduct(id);
  const flags = await getFlags(id);
  globalThis.__lensAudit();
  return <><h1>{product.name}</h1><Suspense fallback={<p>Loading</p>}><Seller id={product.sellerId}/><Authors/></Suspense></>;
}`,
      'Seller.jsx': `import React from 'react'; import {getSeller, getReviews} from './data';
export async function Seller({id}) {const seller=await getSeller(id); const reviews=await getReviews(seller.reviewId); return <p>{reviews}</p>;}`,
      'Authors.jsx': `import React from 'react'; import {getUser} from './data';
export function Authors() {return <>${Array.from({length: 20}, (_, id) => `<Author id={${id}}/>`).join('')}</>;}
async function Author({id}) {const user=await getUser(id); return <span>{user.name}</span>;}`,
      'data.js': `import {cache} from 'react'; import {createBatchedResource} from 'react-compiler-runtime/server';
export const getProduct=cache(id=>globalThis.__lensRead(20,{name:'PRODUCT',sellerId:'seller'}));
export const getFlags=cache(id=>globalThis.__lensRead(50,'flags'));
export const getSeller=cache(id=>globalThis.__lensRead(25,{reviewId:'reviews'}));
export const getReviews=cache(id=>globalThis.__lensRead(15,'REVIEWS'));
export const getUser=createBatchedResource(async keys=>{await globalThis.__lensRead(20,null);return keys.map(([id])=>({status:'fulfilled',value:{name:'AUTHOR_'+id}}));});`,
    };
    await Promise.all(
      Object.entries(sources).map(([name, source]) =>
        writeFile(path.join(directory, name), source)
      )
    );
    let analysis;
    const bundle = path.join(directory, 'server.cjs');
    await esbuild.build({
      absWorkingDir: directory,
      entryPoints: ['./Page.jsx'],
      outfile: bundle,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      plugins: [
        {
          name: 'demo-externals',
          setup(build) {
            build.onResolve(
              {filter: /^(react|react-compiler-runtime\/server)$/},
              args => ({path: require.resolve(args.path), external: true})
            );
          },
        },
        serverPreloadsEsbuildPlugin({
          resources: [
            'getProduct',
            'getFlags',
            'getSeller',
            'getReviews',
            'getUser',
          ].map(importSpecifierName => ({
            source: './data',
            importSpecifierName,
            result:
              importSpecifierName === 'getFlags' ||
              importSpecifierName === 'getReviews'
                ? 'primitive'
                : 'immutable-data',
          })),
          onAnalysis: graph => {
            analysis = graph;
          },
        }),
      ],
    });
    let operations = 0;
    globalThis.__lensRead = (delay, value) => {
      operations++;
      return new Promise(resolve => setTimeout(() => resolve(value), delay));
    };
    globalThis.__lensAudit = () => {};
    const trace = createServerPreloadTrace();
    const request = createServerPreloadRequest({
      maxConcurrent: 2,
      onEvent: trace.onEvent,
    });
    const stream = new PassThrough();
    let output = '';
    stream.on('data', chunk => {
      output += chunk;
    });
    const done = new Promise((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    try {
      const {Page} = require(bundle);
      request.run(() =>
        renderToPipeableStream(
          React.createElement(Page, {id: 'demo'}),
          {},
          {onError: error => stream.destroy(error)}
        ).pipe(stream)
      );
      await done;
      assert(output.includes('AUTHOR_19') && output.includes('REVIEWS'));
    } finally {
      request.close();
    }
    assert.equal(
      operations,
      5,
      'four ordinary reads and one twenty-key bulk operation'
    );
    const snapshot = trace.snapshot();
    const report = {
      sources: Object.fromEntries(
        Object.entries(sources).map(([name, source]) => [
          path.join(directory, name),
          source,
        ])
      ),
      title: 'React server preload lens — Flight demo',
      graph: analysis.dependencyGraph,
      diagnostics: [...analysis.modules.values()].flatMap(
        module => module.diagnostics ?? []
      ),
      trace: snapshot,
    };
    await writeFile(destination, renderServerPreloadLens(report));
    await writeFile(
      destination.replace(/\.html$/, '') + '.json',
      JSON.stringify(report, null, 2)
    );
    process.stdout.write(
      JSON.stringify(
        {
          html: destination,
          backendOperations: operations,
          individualReads: new Set(
            snapshot.events
              .filter(event => event.kind === 'started')
              .map(event => event.taskId)
          ).size,
          peakConcurrency: Math.max(
            ...snapshot.events.map(event => event.active)
          ),
        },
        null,
        2
      ) + '\n'
    );
  } finally {
    await rm(directory, {recursive: true, force: true});
    delete globalThis.__lensRead;
    delete globalThis.__lensAudit;
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
