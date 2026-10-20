/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

const assert = require('node:assert/strict');
const {mkdtemp, writeFile, mkdir, rm, realpath} = require('node:fs/promises');
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

const samples = Number(process.argv[2] ?? 3);
assert(
  Number.isSafeInteger(samples) && samples >= 1 && samples <= 20,
  'Samples must be 1–20'
);
const destination = path.resolve(
  process.argv[3] ?? '/tmp/react-massive-preloads.html'
);
const cap = 8,
  batchSize = 80,
  baseMs = 8,
  perKeyMs = 0.025;
const range = n => Array.from({length: n}, (_, i) => i);
const median = values =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const declarations = kinds =>
  `import {createServerRead} from 'react-compiler-runtime/server';\n` +
  kinds
    .map(
      kind =>
        `export const ${kind}=createServerRead(async id=>(await globalThis.__massiveRead('${kind}',[[id]]))[0].value,{result:'${['order', 'customer', 'next'].includes(kind) ? 'immutable-data' : 'primitive'}',maxBatchSize:${batchSize},async batch(keys){return globalThis.__massiveRead('${kind}',keys);}});`
    )
    .join('\n');
const scenarios = [
  {
    id: 'dashboard',
    title: '32 independent dashboard widgets',
    explanation:
      'A server page awaits independent metric reads in source order. Compiler plans expose all keys before consumption; the bulk loader can combine them. Batching alone cannot anticipate later calls.',
    count: 32,
    kinds: ['metric'],
    tokens: range(32).map(i => `METRIC_${i}_END`),
    page: `import React from 'react'; import {metric} from './data';\nexport async function Page(){\n${range(
      32
    )
      .map(i => `const value${i}=await metric(${i});`)
      .join('\n')}\nreturn <>${range(32)
      .map(i => `<p>{value${i}}</p>`)
      .join('')}</>;}`,
  },
  {
    id: 'directory',
    title: '240 independently rendered people',
    explanation:
      'Each component reads a different person. React already exposes sibling work concurrently; shared batching removes backend round trips. This deliberately shows when batching, rather than compiler preloading, supplies the benefit.',
    count: 240,
    kinds: ['person'],
    tokens: range(240).map(i => `PERSON_${i}_END`),
    page: `import React from 'react'; import {person} from './data';\nexport function Page(){return <>${range(
      240
    )
      .map(i => `<Person id={${i}}/>`)
      .join(
        ''
      )}</>;}\nasync function Person({id}){const value=await person(id);return <p>{value}</p>;}`,
  },
  {
    id: 'fulfillment',
    title: '120 orders across three dependent component levels',
    explanation:
      'Order → customer → credit reads depend on returned IDs across component boundaries. Batch independent keys within each phase; retain the real phase dependencies. The runtime never invents IDs or executes component bodies speculatively.',
    count: 120,
    kinds: ['order', 'customer', 'credit'],
    tokens: range(120).map(i => `READY_${i}_END`),
    page: `import React from 'react';import {order,customer,credit} from './data';\nexport function Page(){return <>${range(
      120
    )
      .map(i => `<Order id={${i}}/>`)
      .join(
        ''
      )}</>;}\nasync function Order({id}){const value=await order(id);return <Customer id={value.customerId}/>;}\nasync function Customer({id}){const value=await customer(id);return <Credit id={value.creditId}/>;}\nasync function Credit({id}){const value=await credit(id);return <p>{value}</p>;}`,
  },
  {
    id: 'dependent-control',
    title: 'Control: 20 genuinely dependent reads',
    explanation:
      'Every key comes from the previous result. Neither compiler scheduling nor batching can remove this dependency chain. Operation counts must remain unchanged; timing differences are noise/overhead, not an optimization win.',
    count: 20,
    kinds: ['next'],
    tokens: ['CHAIN_20'],
    control: true,
    page: `import React from 'react';import {next} from './data';\nexport async function Page(){\n${range(
      20
    )
      .map(
        i =>
          `const value${i}=await next(${i === 0 ? '0' : `value${i - 1}.next`});`
      )
      .join('\n')}\nreturn <p>{'CHAIN_'+value19.next}</p>;}`,
  },
];

function value(kind, id) {
  switch (kind) {
    case 'metric':
      return `METRIC_${id}_END`;
    case 'person':
      return `PERSON_${id}_END`;
    case 'order':
      return {customerId: id};
    case 'customer':
      return {creditId: id};
    case 'credit':
      return `READY_${id}_END`;
    case 'next':
      return {next: id + 1};
    default:
      throw new Error(`Unknown kind ${kind}`);
  }
}

async function measure(api, scenario, features) {
  let active = 0,
    peak = 0;
  const seen = new Set(),
    completed = new Set(),
    operations = [];
  const expected = new Set(
    scenario.kinds.flatMap(kind =>
      range(scenario.count).map(id => JSON.stringify([kind, id]))
    )
  );
  globalThis.__massiveRead = async (kind, keys) => {
    for (const [id] of keys) {
      const key = JSON.stringify([kind, id]);
      assert(expected.has(key), `Unexpected backend key ${key}`);
      assert(!seen.has(key), `Duplicate backend key ${key}`);
      seen.add(key);
      if (kind === 'customer')
        assert(completed.has(JSON.stringify(['order', id])));
      if (kind === 'credit')
        assert(completed.has(JSON.stringify(['customer', id])));
      if (kind === 'next' && id > 0)
        assert(completed.has(JSON.stringify(['next', id - 1])));
    }
    operations.push({kind, keys: keys.length});
    assert(keys.length <= batchSize);
    peak = Math.max(peak, ++active);
    assert(active <= cap, 'Common backend concurrency cap exceeded');
    try {
      await new Promise(resolve =>
        setTimeout(resolve, baseMs + keys.length * perKeyMs)
      );
      for (const [id] of keys) completed.add(JSON.stringify([kind, id]));
      return keys.map(([id]) => ({
        status: 'fulfilled',
        value: value(kind, id),
      }));
    } finally {
      active--;
    }
  };
  const owner = createServerPreloadRequest({
    features,
    maxConcurrent: cap,
    maxQueued: 8192,
    maxPlanSteps: 20000,
  });
  const stream = new PassThrough();
  let payload = '';
  stream.on('data', chunk => {
    payload += chunk;
  });
  const finished = new Promise((resolve, reject) => {
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  const start = performance.now();
  try {
    owner.run(() =>
      renderToPipeableStream(
        React.createElement(api.Page),
        {},
        {onError: error => stream.destroy(error)}
      ).pipe(stream)
    );
    await finished;
    const durationMs = performance.now() - start;
    assert.equal(active, 0, 'Response ended with outstanding backend work');
    assert.deepEqual(
      [...seen].sort(),
      [...expected].sort(),
      'Missing or extra backend keys'
    );
    for (const token of scenario.tokens)
      assert(payload.includes(token), `Missing output ${token}`);
    if (!features.batching || scenario.control)
      assert.equal(operations.length, expected.size);
    if (scenario.id === 'dashboard' && features.preloading && features.batching)
      assert.equal(operations.length, 1);
    if (scenario.id === 'dashboard' && !features.preloading)
      assert.equal(operations.length, 32);

    return {
      durationMs,
      operations: operations.length,
      logicalKeys: seen.size,
      peakConcurrency: peak,
      batchSizes: operations.map(op => op.keys),
    };
  } finally {
    owner.close();
  }
}

function escape(value) {
  return String(value).replace(
    /[&<>"']/g,
    c =>
      ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]
  );
}
function report(results) {
  const data = JSON.stringify(results).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Large server read optimizations</title><style>body{font:16px system-ui;line-height:1.55;max-width:1120px;margin:40px auto;padding:0 24px;color:#172534;background:#fafbf9}h1{font-size:36px}h2{margin-bottom:8px}select,button{font:inherit;padding:8px}label{display:inline-block;margin:12px 24px 12px 0}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{text-align:left;padding:12px;border-bottom:1px solid #dce2dc}.stats{display:flex;gap:32px;flex-wrap:wrap;background:#eaf2ed;padding:20px}.stats strong{font-size:28px;display:block}pre{overflow:auto;background:#e9edef;padding:18px;font-size:12px}summary{cursor:pointer}#notice{color:#735c13}.bar{height:12px;background:#9eb4a7;margin-top:6px}.selected{background:#176b43}small{color:#52616c}</style>
<h1>Large server read optimizations</h1><p>Actual Flight rendering with the same source and backend operation cap in every mode. Four measured combinations isolate compiler preloading from shared batching.</p><p><strong>Controlled synthetic I/O:</strong> ${baseMs} ms per backend round trip plus ${perKeyMs} ms per returned key; concurrency cap ${cap}, group limit ${batchSize}. This models round-trip-dominated reads with a native bulk endpoint. It does not predict production latency. Bulk cost, database plans, payload size, and rate limits determine real savings.</p>
<label>Scenario <select id="scenario">${results.map((s, i) => `<option value="${i}">${escape(s.title)}</option>`).join('')}</select></label><label><input type="checkbox" id="preloading" checked> Compiler preloads</label><label><input type="checkbox" id="batching" checked> Batching</label>
<h2 id="title"></h2><p id="explanation"></p><p id="notice"></p><div class="stats" id="stats"></div><table><thead><tr><th>Measured mode</th><th>Completion median / range</th><th>Backend operations</th><th>Logical keys</th><th>Peak I/O</th></tr></thead><tbody id="rows"></tbody></table><small>${samples} measured renders plus one discarded warmup per scenario/mode. All renders validate final values, exact key sets, deduplication, dependencies and operation caps. Operation counts are medians with ranges when grouping varies. Timing speedups have no pass threshold.</small>
<details><summary>Original component source</summary><pre id="source"></pre></details><details><summary>Resource API declaration</summary><pre id="resource"></pre></details><details><summary>Actual generated component source for selected mode</summary><pre id="compiled"></pre></details>
<script type="application/json" id="data">${data}</script><script>
const data=JSON.parse(document.getElementById('data').textContent);const el=id=>document.getElementById(id);function render(){const scenario=data[Number(el('scenario').value)],mask=(el('preloading').checked?1:0)+(el('batching').checked?2:0),row=scenario.rows[mask],base=scenario.rows[0];el('title').textContent=scenario.title;el('explanation').textContent=scenario.explanation;el('notice').textContent=scenario.control?'Dependency control: no operation-count reduction is possible.':(mask===3&&row.operations>scenario.rows[2].operations?'Preloading exposed dependent work earlier but split it into more backend batches. Compare both time and operation count.':'Only measured values are displayed. Features can interact; savings are not additive.');el('source').textContent=scenario.source;el('resource').textContent=scenario.resource;el('compiled').textContent=row.compiled;el('stats').replaceChildren();for(const [label,value] of [['Completion',row.medianMs.toFixed(1)+' ms'],['Baseline / selected',(base.medianMs/row.medianMs).toFixed(1)+'×'],['Backend operations',base.operations+' → '+row.operations]]){const item=document.createElement('div');const strong=document.createElement('strong');strong.textContent=value;item.append(strong,document.createTextNode(label));el('stats').append(item);}el('rows').replaceChildren();for(const [index,r]of scenario.rows.entries()){const tr=document.createElement('tr');for(const text of [r.label,r.medianMs.toFixed(1)+' ms ('+r.rangeMs.map(n=>n.toFixed(1)).join('–')+')',(r.operationRange[0]===r.operationRange[1]?r.operations:r.operations+' ('+r.operationRange.join('–')+')'),r.logicalKeys,r.peakConcurrency]){const td=document.createElement('td');td.textContent=text;tr.append(td);}const bar=document.createElement('div');bar.className='bar'+(index===mask?' selected':'');bar.style.width=(r.medianMs/Math.max(...scenario.rows.map(r=>r.medianMs))*100)+'%';tr.children[1].append(bar);tr.onclick=()=>{el('preloading').checked=Boolean(index&1);el('batching').checked=Boolean(index&2);render();};el('rows').append(tr);}}for(const id of ['scenario','preloading','batching'])el(id).onchange=render;render();
</script></html>`;
}

(async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'react-large-preloads-'));
  const results = [];
  try {
    for (const scenario of scenarios) {
      const root = path.join(directory, scenario.id);
      await mkdir(root);
      const resource = declarations(scenario.kinds);
      await writeFile(path.join(root, 'Page.jsx'), scenario.page);
      await writeFile(path.join(root, 'data.js'), resource);
      const sourceId = await realpath(path.join(root, 'Page.jsx'));
      const rows = [];
      for (let mask = 0; mask < 4; mask++) {
        const features = {
          preloading: Boolean(mask & 1),
          batching: Boolean(mask & 2),
          criticalPath: false,
          routeManifests: false,
          deferAwait: false,
          lens: false,
        };
        let graph;
        const bundle = path.join(root, `mode${mask}.cjs`);
        await esbuild.build({
          absWorkingDir: root,
          entryPoints: ['./Page.jsx'],
          outfile: bundle,
          platform: 'node',
          format: 'cjs',
          bundle: true,
          plugins: [
            {
              name: 'scenario-externals',
              setup(build) {
                build.onResolve(
                  {filter: /^(react|react-compiler-runtime\/server)$/},
                  args => ({path: require.resolve(args.path), external: true})
                );
              },
            },
            serverPreloadsEsbuildPlugin({
              preloads: {features},
              onAnalysis: analysis => {
                graph = analysis;
              },
            }),
          ],
        });
        const api = require(bundle);
        await measure(api, scenario, features);
        const runs = [];
        for (let index = 0; index < samples; index++)
          runs.push(await measure(api, scenario, features));
        // Renderer yields may split batches differently. Preserve every run and
        // report measured operation ranges rather than assuming fixed grouping.
        rows.push({
          label: [
            'Baseline',
            'Compiler only',
            'Batching only',
            'Compiler + batching',
          ][mask],
          features,
          medianMs: median(runs.map(r => r.durationMs)),
          rangeMs: [
            Math.min(...runs.map(r => r.durationMs)),
            Math.max(...runs.map(r => r.durationMs)),
          ],
          operations: median(runs.map(r => r.operations)),
          operationRange: [
            Math.min(...runs.map(r => r.operations)),
            Math.max(...runs.map(r => r.operations)),
          ],
          logicalKeys: runs[0].logicalKeys,
          peakConcurrency: Math.max(...runs.map(r => r.peakConcurrency)),
          runs,
          compiled: graph.modules.get(sourceId).code,
        });
      }
      results.push({
        id: scenario.id,
        title: scenario.title,
        explanation: scenario.explanation,
        control: Boolean(scenario.control),
        source: scenario.page,
        resource,
        rows,
      });
      console.log(
        JSON.stringify({
          scenario: scenario.id,
          baselineMs: rows[0].medianMs,
          optimizedMs: rows[3].medianMs,
          operations: [rows[0].operations, rows[3].operations],
        })
      );
    }
    await mkdir(path.dirname(destination), {recursive: true});
    await writeFile(destination, report(results));
    await writeFile(
      destination.replace(/\.html$/, '') + '.json',
      JSON.stringify(results, null, 2)
    );
    console.log(destination);
  } finally {
    delete globalThis.__massiveRead;
    await rm(directory, {recursive: true, force: true});
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
