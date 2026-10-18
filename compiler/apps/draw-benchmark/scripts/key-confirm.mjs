import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {ROOT} from './config.mjs';
import {environment,openVariant} from './browser.mjs';
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'results/key-manifest.json'),'utf8'));
const correctness=JSON.parse(fs.readFileSync(path.join(ROOT,'results/key-correctness.json'),'utf8'));
assert.deepEqual(correctness.manifest,manifest);assert.equal(correctness.failures.length,0);
const ids=['results/key-20-off','results/key-20-on','results/key-222-off','results/key-222-on'];
for(const id of ids){assert.ok(correctness.passed.some(v=>v.id===id));}
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const bundles=Object.fromEntries(ids.map(id=>[id,hash(fs.readFileSync(path.join(ROOT,id.startsWith('results/')?'':'dist',id,'app.js')))]));
const env=await environment(),pages=new Map(),samples=Object.fromEntries(ids.map(id=>[id,{warmupMs:[],rawMs:[]} ]));
const report={created:new Date().toISOString(),manifest,bundles,cpu:os.cpus()[0].model,browser:env.browser.version(),warmups:3,trials:9,order:[],complete:false};
const save=()=>fs.writeFileSync(path.join(ROOT,'results/key-confirmation.json'),JSON.stringify(report,null,2));
const quantile=(s,q)=>{const p=(s.length-1)*q,l=Math.floor(p);return s[l]+(s[Math.ceil(p)]-s[l])*(p-l);};
try{
 for(const id of ids)pages.set(id,await openVariant(env,id));
 for(let round=0;round<12;round++)for(let j=0;j<ids.length;j++){
  const id=ids[(round+j)%ids.length],{page,errors}=pages.get(id);await page.bringToFront();
  const result=await page.evaluate(()=>window.drawBench.runSuite({warmups:0,trials:1}));assert.deepEqual(errors,[]);assert.equal(result.production,true);
  const ms=result.medianMs;samples[id][round<3?'warmupMs':'rawMs'].push(ms);report.order.push({round,id,phase:round<3?'warmup':'trial',ms});
  report.summary=Object.entries(samples).filter(([,v])=>v.rawMs.length).map(([id,v])=>{const s=[...v.rawMs].sort((a,b)=>a-b);return{id,...v,medianMs:quantile(s,.5),p25:quantile(s,.25),p75:quantile(s,.75)};});save();console.log(round,id,ms.toFixed(1));
 }
 for(const id of ids)assert.equal(hash(fs.readFileSync(path.join(ROOT,id.startsWith('results/')?'':'dist',id,'app.js'))),bundles[id]);
 report.complete=true;save();console.log(report.summary.map(v=>({id:v.id,medianMs:v.medianMs})));
}finally{await env.close();}
