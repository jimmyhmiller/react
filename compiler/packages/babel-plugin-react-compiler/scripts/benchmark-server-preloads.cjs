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
const {createServerPreloadRequest} = require('react-compiler-runtime/server');
const {serverPreloadsEsbuildPlugin} = require('../esbuild');

const samples = Number(process.argv[2] ?? 7);
if (!Number.isSafeInteger(samples) || samples < 1 || samples > 100) {
  throw new Error('Sample count must be an integer from 1 to 100');
}
const median = values =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function run(Page) {
  let calls = 0,
    active = 0,
    peak = 0;
  const timed = (delay, value) => () => {
    calls++;
    active++;
    peak = Math.max(peak, active);
    return new Promise(resolve =>
      setTimeout(() => {
        active--;
        resolve(value);
      }, delay)
    );
  };
  globalThis.__preloadBenchmark = {
    getProduct: timed(40, {name: 'PRODUCT_PAYLOAD', sellerId: 'seller'}),
    getFlags: timed(60, 'flags'),
    getSeller: timed(30, {reviewId: 'review'}),
    getReviews: timed(40, 'REVIEW_PAYLOAD'),
  };
  const request = createServerPreloadRequest({maxConcurrent: 2});
  const stream = new PassThrough();
  const start = performance.now();
  let shell = null,
    text = '';
  stream.on('data', chunk => {
    text += chunk;
    if (shell === null && text.includes('PRODUCT_PAYLOAD')) {
      shell = performance.now() - start;
    }
  });
  const done = new Promise((resolve, reject) => {
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  try {
    request.run(() =>
      renderToPipeableStream(
        React.createElement(Page, {id: 'id'}),
        {},
        {
          onError: error => {
            stream.destroy(error);
          },
        }
      ).pipe(stream)
    );
    await done;
    assert(text.includes('REVIEW_PAYLOAD'));
    assert.equal(calls, 4, 'preloading must not duplicate native requests');
    assert(peak <= 2);
    return {
      completionMs: performance.now() - start,
      shellMs: shell,
      requests: calls,
      peak,
    };
  } finally {
    request.close();
  }
}

(async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'react-preload-benchmark-')
  );
  try {
    const sources = {
      'Page.jsx': `import React, {Suspense} from 'react'; import {getProduct, getFlags} from './data'; import {Comments} from './barrel';
        export async function Page({id}) {const product=await getProduct(id); const flags=await getFlags(id); return <><h1>{product.name}</h1><Suspense fallback={<p>Loading</p>}><Comments id={product.sellerId}/></Suspense></>;}`,
      'barrel.js': `export {Seller as Comments} from './Seller';`,
      'Seller.jsx': `import React from 'react'; import {loadSeller} from './helper'; import {getReviews} from './data';
        export async function Seller({id}) {const seller=await loadSeller(id); const reviews=await getReviews(seller.reviewId); return <div>{reviews}</div>;}`,
      'helper.js': `import {getSeller} from './data'; export async function loadSeller(id) {const seller=await getSeller(id); return seller;}`,
      'data.js': `import {cache} from 'react';
        export const getProduct=cache(id=>globalThis.__preloadBenchmark.getProduct(id));
        export const getFlags=cache(id=>globalThis.__preloadBenchmark.getFlags(id));
        export const getSeller=cache(id=>globalThis.__preloadBenchmark.getSeller(id));
        export const getReviews=cache(id=>globalThis.__preloadBenchmark.getReviews(id));`,
    };
    await Promise.all(
      Object.entries(sources).map(([name, source]) =>
        writeFile(path.join(directory, name), source)
      )
    );
    const rows = [];
    for (const mode of ['analyze', 'compile']) {
      const output = path.join(directory, mode + '.cjs');
      await esbuild.build({
        absWorkingDir: directory,
        entryPoints: ['./Page.jsx'],
        outfile: output,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        nodePaths: [path.resolve(__dirname, '../../../node_modules')],
        plugins: [
          {
            name: 'benchmark-externals',
            setup(build) {
              build.onResolve(
                {filter: /^(react|react-compiler-runtime\/server)$/},
                args => ({path: require.resolve(args.path), external: true})
              );
            },
          },
          serverPreloadsEsbuildPlugin({
            preloads: {mode},
            resources: [
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
      const {Page} = require(output);
      const results = [];
      for (let index = 0; index < samples; index++) {
        results.push(await run(Page));
      }
      rows.push({
        mode: mode === 'analyze' ? 'original' : 'preloaded',
        samples,
        completionP50Ms: median(results.map(r => r.completionMs)),
        shellP50Ms: median(results.map(r => r.shellMs)),
        requestsPerRender: 4,
        peakRequests: Math.max(...results.map(r => r.peak)),
      });
    }
    process.stdout.write(
      JSON.stringify(
        {
          description:
            'Controlled Flight timer benchmark; not production latency',
          results: rows,
        },
        null,
        2
      ) + '\n'
    );
  } finally {
    await rm(directory, {recursive: true, force: true});
    delete globalThis.__preloadBenchmark;
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
