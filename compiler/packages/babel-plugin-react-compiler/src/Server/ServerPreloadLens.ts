/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {ServerPreloadDependencyGraph} from './ServerPreloadAnalysis';
import type {ServerPreloadDiagnostic} from './CompileServerPreloadGraph';

export type ServerPreloadLensOptions = {
  title?: string;
  /** Optional original source for excerpts in the inspector. */
  sources?: Record<string, string>;
  graph: ServerPreloadDependencyGraph;
  diagnostics?: ReadonlyArray<ServerPreloadDiagnostic>;
  /** One request's trace; task and operation IDs are scoped to that request. */
  trace?: {
    events: ReadonlyArray<{
      kind: string;
      taskId: number;
      resource: string;
      elapsedMs: number;
      priority: number;
      active: number;
      queued: number;
      operationId?: number;
      batchSize?: number;
      speculative: boolean;
    }>;
    droppedEvents?: number;
  };
};

/** A standalone, offline lens: filter tasks, inspect dependencies, and locate retained barriers. */
export function renderServerPreloadLens(
  options: ServerPreloadLensOptions,
): string {
  const title = (options.title ?? 'Server preload lens').replace(
    /[&<>"']/g,
    char =>
      ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[
        char
      ]!,
  );
  const payload = JSON.stringify(options)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
:root{color-scheme:light dark;font:15px system-ui;background:light-dark(#f6f7fa,#131722);color:light-dark(#172338,#e5edf8)}body{max-width:1200px;margin:40px auto;padding:0 24px}h1{font-size:28px;margin-bottom:8px}p{line-height:1.6}.stats{display:flex;flex-wrap:wrap;gap:18px;margin:24px 0}.stat,section{background:light-dark(white,#1e2533);padding:20px;border-radius:10px}.stat strong{display:block;font-size:26px}.stat span{font-size:13px;opacity:.7}input{padding:12px;width:min(500px,90%);margin:12px 0;border:1px solid #718099;border-radius:6px;background:transparent;color:inherit}nav{display:flex;gap:8px;margin:18px 0}button{padding:9px 14px;border:1px solid #718099;border-radius:6px;background:transparent;color:inherit;cursor:pointer}button[aria-selected=true]{background:#274a85;color:white}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:12px 8px;border-bottom:1px solid #71809944;vertical-align:top}td.label{max-width:420px;overflow-wrap:anywhere}thead th{font-weight:600}tr[data-id]{cursor:pointer}tr[data-id]:hover{background:#537fb922}.track{position:relative;min-width:160px;height:18px;background:#71809922;border-radius:3px}.bar{position:absolute;top:0;height:18px;background:#5787db;border-radius:3px;min-width:2px}.wait{background:#c89747}.rejected{background:#d06b78}.muted{opacity:.7}#detail{margin-top:20px;white-space:pre-wrap;overflow-wrap:anywhere}#content{overflow:auto}code{font-size:12px}.badge{border-radius:4px;padding:3px 6px;background:#71809922}footer{margin:24px 0;font-size:12px;opacity:.7}
</style></head><body><h1>${title}</h1><p>Explore backend operations, critical paths, and the boundaries that retain serial work.</p><div class="stats" id="stats"></div><input id="filter" aria-label="Filter by resource, function, or source" placeholder="Filter by resource, function, or source"><nav role="tablist"><button role="tab" data-tab="timeline" aria-selected="true">Timeline</button><button role="tab" data-tab="dependencies" aria-selected="false">Dependencies</button><button role="tab" data-tab="boundaries" aria-selected="false">Retained boundaries</button></nav><section><div id="content"></div><div id="detail" aria-live="polite"></div></section><footer>Compiler graphs describe possible work at source sites. Runtime rows describe actual tasks for one request. A retained boundary is a place to investigate, not permission to move work across it.</footer>
<script type="application/json" id="preload-data">${payload}</script><script>
'use strict';
const data=JSON.parse(document.getElementById('preload-data').textContent);
const events=data.trace?.events??[];
const nodes=new Map(data.graph.nodes.map(n=>[n.id,n]));
const tasks=new Map();
for(const e of events){let task=tasks.get(e.taskId);if(!task){task={id:e.taskId,label:e.resource,queued:e.elapsedMs,priority:e.priority,events:[]};tasks.set(e.taskId,task);}task.events.push(e);if(e.kind==='started'){task.start=e.elapsedMs;task.operation=e.operationId;task.batch=e.batchSize??1;}if(['fulfilled','rejected','cancelled','dropped'].includes(e.kind)){task.end=e.elapsedMs;task.status=e.kind;}}
const end=Math.max(1,...events.map(e=>e.elapsedMs));
const operations=new Set(events.filter(e=>e.kind==='started').map(e=>e.operationId));
const stats=[['Backend operations',operations.size],['Distinct reads',tasks.size],['Peak concurrency',Math.max(0,...events.map(e=>e.active))],['Observed duration',end.toFixed(1)+' ms']];
for(const [label,value] of stats){const el=document.createElement('div');el.className='stat';const number=document.createElement('strong');number.textContent=value;const caption=document.createElement('span');caption.textContent=label;el.append(number,caption);document.getElementById('stats').append(el);}
let tab='timeline';
const content=document.getElementById('content'), detail=document.getElementById('detail'), filter=document.getElementById('filter');
function cell(row,text,cls){const td=document.createElement('td');td.textContent=text;if(cls)td.className=cls;row.append(td);return td;}
function sourceExcerpt(file,line){const source=data.sources?.[file];if(!source||!line)return '';const lines=source.split('\\n');return '\\n\\nSource:\\n'+lines.slice(Math.max(0,line-3),line+2).map((text,index)=>(Math.max(0,line-3)+index+1)+': '+text).join('\\n');}
function showDetail(id){const node=nodes.get(id);const incoming=data.graph.edges.filter(e=>e.to===id),outgoing=data.graph.edges.filter(e=>e.from===id);detail.textContent=(node?.label??id)+'\\n'+(node?.line?node.file+':'+node.line+':'+(node.column+1)+'\\n':'')+'\\nPrerequisites:\\n'+(incoming.map(e=>'  '+(nodes.get(e.from)?.label??e.from)+' ['+e.kind+']').join('\\n')||'  None in the extracted plan')+'\\n\\nUnlocks:\\n'+(outgoing.map(e=>'  '+(nodes.get(e.to)?.label??e.to)+' ['+e.kind+']').join('\\n')||'  No further known dependency')+sourceExcerpt(node?.file,node?.line);}
function render(){content.replaceChildren();detail.textContent='';const q=filter.value.toLowerCase(),table=document.createElement('table'),head=document.createElement('thead'),hr=document.createElement('tr');const headings=tab==='timeline'?['Read / source','Operation','Priority','Time (ms)','Timeline']:tab==='dependencies'?['Source site','Kind','Prerequisites','Unlocks']:['Source','Action','Reason'];for(const label of headings){const th=document.createElement('th');th.textContent=label;hr.append(th);}head.append(hr);table.append(head);const body=document.createElement('tbody');
if(tab==='timeline'){for(const task of tasks.values()){if(!task.label.toLowerCase().includes(q))continue;const tr=document.createElement('tr');tr.dataset.id=task.label;cell(tr,task.label,'label');cell(tr,task.operation===undefined?'—':task.operation+' ('+task.batch+' keys)');cell(tr,String(task.priority));cell(tr,(task.start??task.queued).toFixed(1)+' → '+(task.end??end).toFixed(1));const td=cell(tr,''),track=document.createElement('div');track.className='track';const bar=(from,to,cls)=>{const el=document.createElement('div');el.className='bar '+cls;el.style.left=(from/end*100)+'%';el.style.width=(Math.max(0,to-from)/end*100)+'%';track.append(el);};bar(task.queued,task.start??task.end??end,'wait');if(task.start!==undefined)bar(task.start,task.end??end,task.status==='rejected'?'rejected':'');td.append(track);tr.onclick=()=>{showDetail(task.label);detail.textContent+='\\n\\nEvents:\\n'+task.events.map(e=>e.elapsedMs.toFixed(2)+' ms  '+e.kind+'  active='+e.active+' queued='+e.queued).join('\\n');};body.append(tr);}}
else if(tab==='dependencies'){for(const n of nodes.values()){if(!(n.label+' '+n.file).toLowerCase().includes(q))continue;const tr=document.createElement('tr');tr.dataset.id=n.id;cell(tr,n.label,'label');cell(tr,n.kind);cell(tr,String(data.graph.edges.filter(e=>e.to===n.id).length));cell(tr,String(data.graph.edges.filter(e=>e.from===n.id).length));tr.onclick=()=>showDetail(n.id);body.append(tr);}}
else{for(const d of data.diagnostics??[]){if(d.action==='preload')continue;const loc=d.file+(d.loc?':'+d.loc.start.line+':'+(d.loc.start.column+1):'');if(!(loc+' '+d.reason).toLowerCase().includes(q))continue;const tr=document.createElement('tr');cell(tr,loc,'label');cell(tr,d.action);cell(tr,d.reason);tr.onclick=()=>{detail.textContent=d.reason+sourceExcerpt(d.file,d.loc?.start.line);};body.append(tr);}}
table.append(body);content.append(table);if(body.children.length===0){const p=document.createElement('p');p.className='muted';p.textContent=tab==='timeline'?'No matching runtime tasks. Record a request with createServerPreloadTrace().':'No matching entries.';content.append(p);}if(data.trace?.droppedEvents){const p=document.createElement('p');p.textContent=data.trace.droppedEvents+' events omitted by the recording limit.';content.append(p);}}
for(const button of document.querySelectorAll('[data-tab]')){button.onclick=()=>{tab=button.dataset.tab;for(const b of document.querySelectorAll('[data-tab]'))b.setAttribute('aria-selected',String(b===button));render();};}filter.addEventListener('input',render);render();
</script></body></html>`;
}
