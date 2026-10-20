/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

const assert = require('node:assert/strict');
const {mkdtemp, writeFile, mkdir, rm} = require('node:fs/promises');
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
const {serverPreloadsEsbuildPlugin} = require('../esbuild');
const {renderServerPreloadComparison} = require('../server');
const names = [
  'preloading',
  'batching',
  'criticalPath',
  'routeManifests',
  'deferAwait',
  'lens',
];
const samples = Number(process.argv[2] ?? 3);
if (!Number.isSafeInteger(samples) || samples < 1 || samples > 20) {
  throw new Error('Samples must be an integer from 1 to 20');
}
const destination = path.resolve(
  process.argv[3] ?? '/tmp/react-preload-features.html'
);
const median = values =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const sources = {
  'entry.js': `export {Page} from './Page'; export {default as manifest} from 'react:server-preload-manifest';`,
  'Page.jsx': `import React, {Suspense} from 'react'; import {getProduct,getFlags,getReviews} from './data'; import {Authors} from './Authors'; import {StageChain} from './StageChain';
export async function Page({id}) {
  'use defer to suspense';
  const product=await getProduct(id);
  const flags=await getFlags(id);
  const reviews=await getReviews(id);
  return <><h1>SHELL_PAYLOAD</h1><Suspense fallback={<p>Loading</p>}><ReviewCard reviews={reviews}/><Authors/><StageChain id={id}/></Suspense></>;
}
function ReviewCard({reviews}) {return <p>{reviews}</p>;}`,
  'Authors.jsx': `import React from 'react'; import {getUser} from './data';
export function Authors() {return <>${Array.from({length: 20}, (_, id) => `<Author id="user${id}"/>`).join('')}</>;}
async function Author({id}) {const user=await getUser(id); return <span>{user.name}</span>;}`,
  'StageChain.jsx': `import React from 'react'; import {getStage1,getStage2,getStage3} from './data';
export async function StageChain({id}) {const one=await getStage1(id);const two=await getStage2(one.next);const three=await getStage3(two.next);return <p>{three}</p>;}`,
  'data.js': `import {createBatchedResource,createServerRead} from 'react-compiler-runtime/server';
function define(name,delay,value) {const resource=createBatchedResource(async keys=>{await globalThis.__featureComparison.io(name,delay,keys.length);return keys.map(()=>({status:'fulfilled',value}));},{maxBatchSize:1});Object.defineProperty(resource,'name',{value:name});return resource;}
export const getProduct=define('product',20,{name:'product'});
export const getFlags=define('flags',50,'flags');
export const getReviews=define('reviews',90,'REVIEWS_PAYLOAD');
export const getStage1=define('stage1',25,{next:'two'});
export const getStage2=define('stage2',25,{next:'three'});
export const getStage3=define('stage3',25,'CRITICAL_CONTENT');
export const getUser=createServerRead(async id=>{await globalThis.__featureComparison.io('users',15,1);return {name:'AUTHOR_'+id};},{result:'immutable-data',async batch(keys){await globalThis.__featureComparison.io('users',15,keys.length);return keys.map(([id])=>({status:'fulfilled',value:{name:'AUTHOR_'+id}}));}});
Object.defineProperty(getUser,'name',{value:'getUser'});`,
};
const resources = [
  'getProduct',
  'getFlags',
  'getReviews',
  'getUser',
  'getStage1',
  'getStage2',
  'getStage3',
].map(importSpecifierName => ({
  source: './data',
  importSpecifierName,
  result: ['getFlags', 'getReviews', 'getStage3'].includes(importSpecifierName)
    ? 'primitive'
    : 'immutable-data',
}));
async function run(api, features) {
  let operations = 0,
    active = 0,
    peak = 0,
    logicalKeys = 0;
  globalThis.__featureComparison = {
    io(_name, delay, keys) {
      operations++;
      logicalKeys += keys;
      active++;
      peak = Math.max(peak, active);
      return new Promise(resolve =>
        setTimeout(() => {
          active--;
          resolve();
        }, delay)
      );
    },
  };
  const trace = createServerPreloadTrace();
  const start = performance.now();
  const owner = createServerPreloadRequest({
    maxConcurrent: 2,
    features,
    onEvent: trace.onEvent,
  });
  const output = new PassThrough();
  let text = '',
    shellMs = null,
    criticalContentMs = null;
  output.on('data', chunk => {
    text += chunk;
    if (shellMs === null && text.includes('SHELL_PAYLOAD'))
      shellMs = performance.now() - start;
    if (criticalContentMs === null && text.includes('CRITICAL_CONTENT'))
      criticalContentMs = performance.now() - start;
  });
  const done = new Promise((resolve, reject) => {
    output.on('end', resolve);
    output.on('error', reject);
  });
  try {
    owner.run(() => api.manifest.preload('product', {id: 'product'}));
    // This independent router work is charged to every profile, including the baseline.
    await new Promise(resolve => setTimeout(resolve, 30));
    owner.run(() =>
      renderToPipeableStream(
        React.createElement(api.Page, {id: 'product'}),
        {},
        {onError: error => output.destroy(error)}
      ).pipe(output)
    );
    await done;
    assert(
      text.includes('REVIEWS_PAYLOAD') &&
        text.includes('AUTHOR_user19') &&
        text.includes('CRITICAL_CONTENT')
    );
    assert(
      shellMs !== null && criticalContentMs !== null,
      'expected shell and critical content payloads'
    );
    assert.equal(
      logicalKeys,
      26,
      'all profiles must consume the same distinct resource keys exactly once'
    );
    assert.equal(
      operations,
      features.batching ? 7 : 26,
      'batching alone controls backend request count'
    );
    assert.equal(
      active,
      0,
      'the response must consume all started backend work'
    );
    assert(
      peak <= 2,
      'every profile must respect the same backend operation cap'
    );
    return {
      shellMs,
      criticalContentMs,
      completionMs: performance.now() - start,
      operations,
      peakConcurrency: peak,
      trace: trace.snapshot(),
    };
  } finally {
    owner.close();
  }
}
(async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'react-feature-comparison-')
  );
  const rows = [];
  try {
    await Promise.all(
      Object.entries(sources).map(([name, source]) =>
        writeFile(path.join(directory, name), source)
      )
    );
    for (let mask = 0; mask < 64; mask++) {
      const features = Object.fromEntries(
        names.map((name, index) => [name, Boolean(mask & (2 ** index))])
      );
      let analysis;
      const bundle = path.join(directory, 'profile' + mask + '.cjs');
      await esbuild.build({
        absWorkingDir: directory,
        entryPoints: ['./entry.js'],
        outfile: bundle,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        plugins: [
          {
            name: 'comparison-externals',
            setup(build) {
              build.onResolve(
                {filter: /^(react|react-compiler-runtime\/server)$/},
                args => ({path: require.resolve(args.path), external: true})
              );
            },
          },
          serverPreloadsEsbuildPlugin({
            resources,
            routes: [{id: 'product', source: './Page.jsx', exportName: 'Page'}],
            preloads: {features},
            onAnalysis: graph => {
              analysis = graph;
            },
          }),
        ],
      });
      const api = require(bundle),
        runs = [];
      await run(api, features); // Unmeasured warmup for every profile.
      for (let sample = 0; sample < samples; sample++) {
        runs.push(await run(api, features));
      }
      const representative = [...runs].sort(
        (a, b) => a.completionMs - b.completionMs
      )[Math.floor(samples / 2)];
      const row = {
        features,
        samples,
        shellMs: median(runs.map(run => run.shellMs)),
        criticalContentMs: median(runs.map(run => run.criticalContentMs)),
        completionMs: median(runs.map(run => run.completionMs)),
        operations: representative.operations,
        peakConcurrency: Math.max(...runs.map(run => run.peakConcurrency)),
        completionRangeMs: [
          Math.min(...runs.map(run => run.completionMs)),
          Math.max(...runs.map(run => run.completionMs)),
        ],
      };
      if (features.lens) {
        row.lens = {
          title: 'Measured feature profile ' + mask,
          graph: analysis.dependencyGraph,
          diagnostics: [...analysis.modules.values()].flatMap(
            module => module.diagnostics ?? []
          ),
          sources: Object.fromEntries(
            Object.entries(sources).map(([name, source]) => [
              path.join(directory, name),
              source,
            ])
          ),
          trace: representative.trace,
        };
      }
      rows.push(row);
      if ((mask + 1) % 8 === 0) {
        process.stderr.write('Measured ' + (mask + 1) + '/64 profiles\n');
      }
    }
    await mkdir(path.dirname(destination), {recursive: true});
    await writeFile(destination, renderServerPreloadComparison(rows));
    await writeFile(
      destination.replace(/\.html$/, '') + '.json',
      JSON.stringify(rows, null, 2)
    );
    process.stdout.write(
      JSON.stringify(
        {
          html: destination,
          samplesPerProfile: samples,
          profiles: rows.length,
          baseline: rows[0],
          allEnabled: {...rows[63], lens: undefined},
        },
        null,
        2
      ) + '\n'
    );
  } finally {
    await rm(directory, {recursive: true, force: true});
    delete globalThis.__featureComparison;
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
