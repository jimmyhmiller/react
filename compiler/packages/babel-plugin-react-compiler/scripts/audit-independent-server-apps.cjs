/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {tmpdir} = require('node:os');
const {createHash} = require('node:crypto');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {PassThrough} = require('node:stream');
const esbuild = require('esbuild');
const {transformSync} = require('@babel/core');
const t = require('@babel/types');
const React = require('react');
const {
  renderToPipeableStream,
} = require('react-server-dom-webpack/server.node');
const {JSDOM} = require('jsdom');
const {
  createServerPreloadRequest,
  createServerPreloadTrace,
} = require('react-compiler-runtime/server');
const {serverPreloadsEsbuildPlugin} = require('../esbuild');
const execute = promisify(execFile);
const root = path.resolve(__dirname, '../../../examples/server-apps');
const samples = Number(process.argv[2] ?? 5);
assert(Number.isSafeInteger(samples) && samples >= 1 && samples <= 20);
const destination = path.resolve(
  process.argv[3] ?? '/tmp/react-independent-apps.html'
);
const apps = [
  {
    id: 'bookshop',
    arrays: ['getStores', 'getReviews'],
    findings:
      'Already approximately optimal: root book → sibling sections → stock/reviewers/related authors. Store lookups already use Promise.all. Compiler misses map callbacks and formatting-heavy JSX, but the guarded manual probe cannot remove a genuine I/O layer.',
  },
  {
    id: 'team-dashboard',
    arrays: ['readProjects', 'readActivity'],
    findings:
      'A real miss: activity/billing wait behind projects and every task summary, and project owners wait behind task-summary consumption. Their keys were available earlier. The guarded manual probe starts these branches earlier without moving original consumption.',
  },
  {
    id: 'travel',
    arrays: ['getTransport'],
    exclude: ['getTripTotals'],
    findings:
      'Already approximately optimal: trip → days → activities → places. Promise.all and sibling rendering overlap other work; cached totals share the same native reads. getTripTotals is a composite helper, not a native endpoint. map/flatMap/Promise.all and rich JSX also limit current extraction.',
  },
];
const modes = [
  'Original',
  'Compiler, no contracts',
  'Compiler, reviewed contracts',
  'Manual guarded preload probe',
  'Diagnostic only: explicit props + compiler',
];
const latencyMs = 20,
  cap = 8;
const features = {
  preloading: true,
  batching: false,
  criticalPath: false,
  routeManifests: false,
  deferAwait: false,
  lens: true,
};
const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const hash = s => createHash('sha256').update(s).digest('hex');
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function text(html) {
  const dom = new JSDOM(html);
  const value = dom.window.document.body.textContent
    .replace(/\s+/g, ' ')
    .trim();
  dom.window.close();
  return value;
}
async function fingerprints() {
  const out = {};
  for (const app of apps) {
    out[app.id] = {};
    for (const name of [
      'Page.jsx',
      'data.js',
      'backend.js',
      'fixtures.json',
      'README.md',
    ])
      out[app.id][name] = hash(
        await fs.readFile(path.join(root, app.id, name))
      );
  }
  return out;
}

async function render(api, fixture, backend) {
  let active = 0,
    peak = 0;
  const queue = [],
    calls = [];
  const trace = createServerPreloadTrace();
  const start = performance.now();
  function drain() {
    while (active < cap && queue.length) {
      const job = queue.shift();
      active++;
      peak = Math.max(peak, active);
      job.call.startedMs = performance.now() - start;
      (async () => {
        try {
          await new Promise(resolve => setTimeout(resolve, latencyMs));
          const value = freeze(await backend.request(...job.args));
          job.call.valueHash = hash(JSON.stringify(value));
          job.resolve(value);
        } catch (error) {
          job.reject(error);
        } finally {
          job.call.endedMs = performance.now() - start;
          active--;
          drain();
        }
      })();
    }
  }
  globalThis.__independentBackend = (...args) => {
    const call = {
      key: JSON.stringify(args),
      queuedMs: performance.now() - start,
    };
    calls.push(call);
    return new Promise((resolve, reject) => {
      queue.push({args, call, resolve, reject});
      drain();
    });
  };
  const owner = createServerPreloadRequest({
    features,
    maxConcurrent: cap,
    maxQueued: 1024,
    maxPlanSteps: 10000,
    onEvent: trace.onEvent,
  });
  const output = new PassThrough();
  let wire = '';
  output.on('data', chunk => {
    wire += chunk;
  });
  const done = new Promise((resolve, reject) => {
    output.on('end', resolve);
    output.on('error', reject);
  });
  try {
    owner.run(() =>
      renderToPipeableStream(
        React.createElement(api.Page, fixture.props),
        {},
        {onError: error => output.destroy(error)}
      ).pipe(output)
    );
    await done;
    const completionMs = performance.now() - start;
    assert.equal(active, 0);
    assert.equal(queue.length, 0);
    assert(peak <= cap);
    assert.equal(
      calls.length,
      new Set(calls.map(c => c.key)).size,
      'Repeated native I/O for a cached key'
    );
    return {
      completionMs,
      operations: calls.length,
      uniqueKeys: new Set(calls.map(c => c.key)).size,
      peakConcurrency: peak,
      calls,
      trace: trace.snapshot(),
      wire,
    };
  } finally {
    owner.close();
  }
}
function escape(s) {
  return String(s).replace(
    /[&<>"']/g,
    c =>
      ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]
  );
}
function htmlReport(results, snapshots) {
  const data = JSON.stringify(results).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Independent app audit</title><style>body{font:16px system-ui;line-height:1.55;max-width:1200px;margin:36px auto;padding:0 24px;background:#f7f8f5;color:#20312b}select{font:inherit;padding:8px;margin:8px 16px 8px 0}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{text-align:left;padding:12px;border-bottom:1px solid #ccd5ce}pre{overflow:auto;background:#e8ece7;padding:16px;font-size:12px}iframe{width:100%;height:680px;border:1px solid #ccd5ce;background:white}.note{padding:16px;background:#e8f0e8}summary{cursor:pointer}small{color:#58665e}</style><h1>Independent app audit</h1><p>Three isolated app authors were given feature requests and a standard async React/data boundary, without the optimization objective. Their source was fingerprinted before evaluation and kept unchanged. A separate reviewer assessed schedules without inspecting the compiler.</p><p class="note">Measured through actual Flight rendering. All modes use the same native backend, ${latencyMs} ms synthetic latency per request, and a shared ${cap}-operation cap. No bulk endpoint was invented; batching is off. Reviewed contracts are configuration for existing cached readers, not rewrites of components. Manual probes are separate non-consuming preloads, not compiler output. The explicitly labeled diagnostic mode removes Page prop defaults in a temporary copy only; all fixtures supply those props. It isolates a compiler limitation and is not a general app rewrite.</p><select id="app">${results.map((r, i) => `<option value="${i}">${escape(r.id)}</option>`).join('')}</select><select id="fixture"></select><h2 id="title"></h2><p id="findings"></p><p id="comparison"></p><table><thead><tr><th>Mode</th><th>Median / range</th><th>Native operations</th><th>Unique keys</th><th>Peak I/O</th><th>Extracted read sites</th></tr></thead><tbody id="rows"></tbody></table><small>${samples} measured samples and one discarded warmup per fixture/mode. Every measured render is decoded into static HTML and compared with original HTML; expected text, exact native keys/results and request caps are checked. Timings are observations, not production predictions. This small agent-built corpus is a discovery exercise, not broad compatibility evidence.</small><h2>Rendered app</h2><iframe id="preview" title="Original rendered app"></iframe><details><summary>Authored component source</summary><pre id="source"></pre></details><details><summary>Separate manual preload probe</summary><pre id="probe"></pre></details><details><summary>Compiler retain/skip diagnostics</summary><pre id="diagnostics"></pre></details><details><summary>Source fingerprints</summary><pre>${escape(JSON.stringify(snapshots, null, 2))}</pre></details><script type="application/json" id="data">${data}</script><script>const data=JSON.parse(document.getElementById('data').textContent),el=id=>document.getElementById(id);function fixtures(){el('fixture').replaceChildren();for(const [i,f]of data[Number(el('app').value)].fixtures.entries()){const option=document.createElement('option');option.value=i;option.textContent=f.name;el('fixture').append(option);}render();}function render(){const app=data[Number(el('app').value)],fixture=app.fixtures[Number(el('fixture').value)];el('title').textContent=fixture.name;el('findings').textContent=app.findings;el('comparison').textContent='Original / compiler: '+(fixture.rows[0].medianMs/fixture.rows[2].medianMs).toFixed(2)+'×. Original / manual probe: '+(fixture.rows[0].medianMs/fixture.rows[3].medianMs).toFixed(2)+'×.';el('source').textContent=app.source;el('probe').textContent=app.probe;el('diagnostics').textContent=JSON.stringify(app.analysis,null,2);el('preview').srcdoc=fixture.rows[0].html;el('rows').replaceChildren();for(const r of fixture.rows){const tr=document.createElement('tr');for(const v of [r.mode,r.medianMs.toFixed(1)+' ms ('+r.rangeMs.map(n=>n.toFixed(1)).join('–')+')',r.operations,r.uniqueKeys,r.peakConcurrency,r.extractedReads]){const td=document.createElement('td');td.textContent=v;tr.append(td);}tr.onclick=()=>{el('preview').srcdoc=r.html;};el('rows').append(tr);}}el('app').onchange=fixtures;el('fixture').onchange=render;fixtures();</script></html>`;
}

(async () => {
  const snapshots = JSON.parse(
    await fs.readFile(path.join(root, 'author-snapshots.json'), 'utf8')
  );
  assert.deepEqual(
    await fingerprints(),
    snapshots,
    'Authored sources changed before audit'
  );
  const directory = await fs.mkdtemp(
    path.join(tmpdir(), 'react-independent-apps-')
  );
  const results = [];
  try {
    for (const app of apps) {
      const folder = path.join(root, app.id),
        backendFile = path.join(directory, app.id + '-backend.cjs'),
        adapter = path.join(directory, app.id + '-adapter.cjs');
      await esbuild.build({
        entryPoints: [path.join(folder, 'backend.js')],
        outfile: backendFile,
        platform: 'node',
        format: 'cjs',
        bundle: true,
      });
      const backend = require(backendFile);
      await fs.writeFile(
        adapter,
        'exports.request=(...args)=>globalThis.__independentBackend(...args);\n'
      );
      const fixtureDefs = JSON.parse(
        await fs.readFile(path.join(folder, 'fixtures.json'), 'utf8')
      );
      const source = await fs.readFile(path.join(folder, 'Page.jsx'), 'utf8'),
        probe = await fs.readFile(
          path.join(root, 'probes', app.id + '.jsx'),
          'utf8'
        );
      const data = await fs.readFile(path.join(folder, 'data.js'), 'utf8');
      const names = [...data.matchAll(/export const (\w+)\s*=/g)]
        .map(m => m[1])
        .filter(n => !app.exclude?.includes(n));
      const resources = names.map(importSpecifierName => ({
        source: './data.js',
        importSpecifierName,
        result: app.arrays.includes(importSpecifierName)
          ? 'array'
          : 'immutable-data',
      }));
      const removedDefaults = [];
      const diagnosticSource = transformSync(source, {
        babelrc: false,
        configFile: false,
        parserOpts: {plugins: ['jsx']},
        plugins: [
          () => ({
            visitor: {
              FunctionDeclaration(fn) {
                if (fn.node.id?.name !== 'Page') return;
                for (const param of fn.node.params) {
                  if (!t.isObjectPattern(param)) continue;
                  for (const prop of param.properties) {
                    if (
                      t.isObjectProperty(prop) &&
                      t.isAssignmentPattern(prop.value) &&
                      t.isIdentifier(prop.value.left)
                    ) {
                      removedDefaults.push(prop.value.left.name);
                      prop.value = prop.value.left;
                    }
                  }
                }
              },
            },
          }),
        ],
      }).code;
      for (const fixture of fixtureDefs)
        for (const name of removedDefaults) {
          assert(
            Object.hasOwn(fixture.props, name),
            'Diagnostic normalization requires explicit fixture props'
          );
        }
      const diagnosticFolder = path.join(directory, app.id + '-explicit-props');
      await fs.mkdir(diagnosticFolder);
      await fs.writeFile(
        path.join(diagnosticFolder, 'Page.jsx'),
        diagnosticSource
      );
      await fs.writeFile(path.join(diagnosticFolder, 'data.js'), data);
      const backendImporters = new Set([
        await fs.realpath(folder),
        await fs.realpath(diagnosticFolder),
      ]);
      const result = {
        id: app.id,
        findings: app.findings,
        source,
        probe,
        contracts: resources,
        diagnosticSource,
        removedDefaults,
        analysis: [],
        fixtures: fixtureDefs.map(f => ({...f, rows: []})),
      };
      for (let mode = 0; mode < modes.length; mode++) {
        let graph;
        const bundle = path.join(directory, app.id + '-' + mode + '.cjs');
        await esbuild.build({
          absWorkingDir: mode === 4 ? diagnosticFolder : folder,
          entryPoints: [
            mode === 3
              ? path.join(root, 'probes', app.id + '.jsx')
              : path.join(mode === 4 ? diagnosticFolder : folder, 'Page.jsx'),
          ],
          outfile: bundle,
          platform: 'node',
          format: 'cjs',
          bundle: true,
          jsx: 'automatic',
          plugins: [
            {
              name: 'audit-boundaries',
              setup(build) {
                build.onResolve(
                  {filter: /^react(?:\/.*)?$|^react-compiler-runtime\/server$/},
                  args => ({path: require.resolve(args.path), external: true})
                );
                build.onResolve({filter: /backend\.js$/}, args =>
                  backendImporters.has(path.dirname(args.importer))
                    ? {path: adapter, external: true}
                    : undefined
                );
              },
            },
            ...(mode === 1 || mode === 2 || mode === 4
              ? [
                  serverPreloadsEsbuildPlugin({
                    resources: mode === 1 ? [] : resources,
                    preloads: {features},
                    onAnalysis: g => {
                      graph = g;
                    },
                  }),
                ]
              : []),
          ],
        });
        const api = require(bundle);
        const diagnostics = graph
          ? [...graph.modules.values()].flatMap(m => m.diagnostics ?? [])
          : [];
        const extractedReads =
          graph?.dependencyGraph.nodes.filter(n => n.kind === 'read').length ??
          0;
        result.analysis.push({
          mode: modes[mode],
          extractedReads,
          diagnostics,
          compiled: graph
            ? [...graph.modules]
                .filter(([id]) => id.endsWith('/Page.jsx'))
                .map(([id, m]) => ({id, code: m.code}))
            : [],
        });
        for (const fixture of result.fixtures) {
          await render(api, fixture, backend);
          const runs = [];
          for (let sample = 0; sample < samples; sample++) {
            const run = await render(api, fixture, backend);
            const wireFile = path.join(directory, 'render.flight');
            await fs.writeFile(wireFile, run.wire);
            const decoded = await execute(
              process.execPath,
              [path.join(__dirname, 'decode-server-app-flight.cjs'), wireFile],
              {maxBuffer: 10 * 1024 * 1024, timeout: 15000}
            );
            const html = JSON.parse(decoded.stdout).html;
            const renderedText = text(html);
            for (const expected of fixture.expectedText)
              assert(
                renderedText.includes(expected.replace(/\s+/g, ' ')),
                `${app.id}/${fixture.name}/${modes[mode]} missing ${expected}`
              );
            const canonicalCalls = run.calls
              .map(c => [c.key, c.valueHash])
              .sort((a, b) =>
                JSON.stringify(a).localeCompare(JSON.stringify(b))
              );
            const reference = fixture.rows[0]?.runs[0] ?? runs[0];
            if (reference) {
              assert.equal(html, reference.html, 'Rendered host HTML changed');
              assert.deepEqual(
                canonicalCalls,
                reference.canonicalCalls,
                'Native keys/results changed'
              );
            }
            delete run.wire;
            run.html = html;
            run.canonicalCalls = canonicalCalls;
            runs.push(run);
          }
          fixture.rows.push({
            mode: modes[mode],
            medianMs: median(runs.map(r => r.completionMs)),
            rangeMs: [
              Math.min(...runs.map(r => r.completionMs)),
              Math.max(...runs.map(r => r.completionMs)),
            ],
            operations: runs[0].operations,
            uniqueKeys: runs[0].uniqueKeys,
            peakConcurrency: Math.max(...runs.map(r => r.peakConcurrency)),
            extractedReads,
            html: runs[0].html,
            runs,
          });
        }
      }
      results.push(result);
      console.log(
        JSON.stringify({
          app: app.id,
          fixtures: result.fixtures.map(f => ({
            name: f.name,
            modes: f.rows.map(r => ({
              mode: r.mode,
              ms: Math.round(r.medianMs),
              operations: r.operations,
              readSites: r.extractedReads,
            })),
          })),
        })
      );
    }
    assert.deepEqual(
      await fingerprints(),
      snapshots,
      'Authored apps were modified during evaluation'
    );
    await fs.mkdir(path.dirname(destination), {recursive: true});
    await fs.writeFile(destination, htmlReport(results, snapshots));
    await fs.writeFile(
      destination.replace(/\.html$/, '') + '.json',
      JSON.stringify({latencyMs, cap, samples, snapshots, results}, null, 2)
    );
    console.log(destination);
  } finally {
    delete globalThis.__independentBackend;
    await fs.rm(directory, {recursive: true, force: true});
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
