/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  renderServerPreloadLens,
  ServerPreloadLensOptions,
} from './ServerPreloadLens';

export type ServerFeatureProfile = {
  preloading: boolean;
  batching: boolean;
  criticalPath: boolean;
  routeManifests: boolean;
  deferAwait: boolean;
  lens: boolean;
};
export type ServerPreloadComparisonRow = {
  features: ServerFeatureProfile;
  samples: number;
  shellMs: number;
  criticalContentMs: number;
  completionMs: number;
  operations: number;
  peakConcurrency: number;
  completionRangeMs: [number, number];
  lens?: ServerPreloadLensOptions;
};

/** Selects real measured profiles; absent measurements are never interpolated. */
export function renderServerPreloadComparison(
  rows: ReadonlyArray<ServerPreloadComparisonRow>,
): string {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = JSON.stringify(
      [
        'preloading',
        'batching',
        'criticalPath',
        'routeManifests',
        'deferAwait',
        'lens',
      ].map(name => row.features[name as keyof ServerFeatureProfile]),
    );
    if (seen.has(key)) {
      throw new Error('Duplicate measured feature profile');
    }
    seen.add(key);
    if (
      !Number.isSafeInteger(row.samples) ||
      row.samples < 1 ||
      [
        row.shellMs,
        row.criticalContentMs,
        row.completionMs,
        row.operations,
        row.peakConcurrency,
        ...row.completionRangeMs,
      ].some(value => !Number.isFinite(value) || value < 0)
    ) {
      throw new Error(
        'Comparison rows require finite measured metrics and positive sample counts',
      );
    }
  }
  const profiles = rows.map(row => ({
    ...row,
    lens: row.lens == null ? null : renderServerPreloadLens(row.lens),
  }));
  const json = JSON.stringify(profiles)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>React server feature comparison</title><style>
:root{font:15px system-ui;color-scheme:light dark;background:light-dark(#f5f7fa,#131722);color:light-dark(#172338,#e5edf8)}body{max-width:1200px;margin:36px auto;padding:0 24px}h1{font-size:30px}p{line-height:1.6;max-width:950px}fieldset,section{padding:20px;border:1px solid #71809966;border-radius:10px;margin:20px 0}fieldset{display:flex;flex-wrap:wrap;gap:20px}label{display:flex;gap:8px;align-items:center}button{padding:9px 14px;background:transparent;color:inherit;border:1px solid #718099;border-radius:6px;cursor:pointer;margin-right:8px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:12px 8px;text-align:left;border-bottom:1px solid #71809944}.bars{width:180px}.bar{height:10px;background:#71809966;margin:4px 0;border-radius:2px}.selected{background:#5787db}iframe{width:100%;height:640px;border:1px solid #71809966;border-radius:8px}#status{font-size:13px;opacity:.8}.positive{color:light-dark(#166535,#7bdb9c)}.negative{color:light-dark(#a43737,#f09e9e)}details{margin:24px 0}.matrix{max-height:320px;overflow:auto}#matrix tbody tr{cursor:pointer}#matrix tr:hover{background:#537fb922}</style></head><body>
<h1>React server feature comparison</h1><p>Toggle compiler and runtime features to inspect actual Flight measurements. Every combination was built and rendered separately with the same data. Values are medians from controlled timers on this Mac, not production latency estimates.</p>
<fieldset id="features"><legend>Features</legend></fieldset><button id="baseline">All off</button><button id="enabled">All on</button><p id="status" aria-live="polite"></p>
<section><table id="metrics"><thead><tr><th>Metric</th><th>All off</th><th>Selected</th><th>Difference</th><th class="bars">Relative time</th></tr></thead><tbody></tbody></table></section>
<p>Timing starts before 30 ms of independent router work. Route manifests can overlap reads with that work. The workload renders a product shell, twenty authors, a three-read dependent chain, and a deferred review panel. Shell and critical-content times measure when their payloads reach the Flight stream. Features interact, so their savings do not add together. Critical-path scheduling may trade later shell arrival for earlier dependent content. Lens recording is diagnostic rather than a speed optimization.</p>
<details><summary>All measured combinations</summary><div class="matrix"><table id="matrix"><thead><tr><th>Enabled features</th><th>Shell ms</th><th>Critical content ms</th><th>Completion ms</th><th>Backend operations</th></tr></thead><tbody></tbody></table></div></details>
<h2>Selected request trace</h2><p id="trace-status"></p><iframe id="trace" title="Selected server preload trace"></iframe>
<script type="application/json" id="comparison-data">${json}</script><script>
'use strict';const rows=JSON.parse(document.getElementById('comparison-data').textContent);const names=['preloading','batching','criticalPath','routeManifests','deferAwait','lens'];const labels=['Render preloads','Batching','Critical paths','Route manifests','Deferred await','Lens recording'];const mask=f=>names.reduce((value,key,index)=>value+(f[key]?2**index:0),0);const byMask=new Map(rows.map(row=>[mask(row.features),row]));const baseline=byMask.get(0);const controls=[];
for(let index=0;index<names.length;index++){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.id=names[index];input.onchange=render;label.append(input,document.createTextNode(labels[index]));controls.push(input);document.getElementById('features').append(label);}
function choose(value){controls.forEach((input,index)=>{input.checked=Boolean(value&2**index);});render();}
function td(row,text){const cell=document.createElement('td');cell.textContent=text;row.append(cell);return cell;}
function render(){const selected=controls.reduce((value,input,index)=>value+(input.checked?2**index:0),0),row=byMask.get(selected),body=document.querySelector('#metrics tbody');body.replaceChildren();const trace=document.getElementById('trace');if(!row||!baseline){document.getElementById('status').textContent='This exact feature combination has not been measured.';trace.srcdoc='';return;}
document.getElementById('status').textContent=row.samples+' renders per profile. Completion range: '+row.completionRangeMs.map(value=>value.toFixed(1)).join('–')+' ms. '+rows.length+' measured combinations.';
for(const [key,label,timing] of [['shellMs','Shell arrival',true],['criticalContentMs','Critical content arrival',true],['completionMs','Full response',true],['operations','Backend operations',false],['peakConcurrency','Peak backend concurrency',false]]){const tr=document.createElement('tr'),original=baseline[key],current=row[key],difference=current-original;td(tr,label);td(tr,timing?original.toFixed(1)+' ms':original);td(tr,timing?current.toFixed(1)+' ms':current);const change=td(tr,(difference>0?'+':'')+(timing?difference.toFixed(1)+' ms':difference));change.className=difference<0?'positive':difference>0?'negative':'';const bars=td(tr,'');if(timing){const max=Math.max(original,current,1);for(const [value,cls] of [[original,'bar'],[current,'bar selected']]){const bar=document.createElement('div');bar.className=cls;bar.style.width=(value/max*180)+'px';bars.append(bar);}}body.append(tr);}
document.getElementById('trace-status').textContent=row.features.lens?'Recording enabled. Task rows distinguish reads; operation IDs identify backend batches.':'Recording disabled for this profile. Timing and backend counters were measured independently.';trace.hidden=!row.lens;trace.srcdoc=row.lens??'';}
for(const row of rows){const tr=document.createElement('tr');td(tr,names.filter(key=>row.features[key]).join(', ')||'All off');td(tr,row.shellMs.toFixed(1));td(tr,row.criticalContentMs.toFixed(1));td(tr,row.completionMs.toFixed(1));td(tr,row.operations);tr.onclick=()=>choose(mask(row.features));document.querySelector('#matrix tbody').append(tr);}
document.getElementById('baseline').onclick=()=>choose(0);document.getElementById('enabled').onclick=()=>choose(63);choose(byMask.has(63)?63:0);
</script></body></html>`;
}
