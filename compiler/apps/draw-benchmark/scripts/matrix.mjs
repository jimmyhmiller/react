import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {ROOT} from './config.mjs';
import {environment,openVariant} from './browser.mjs';
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'dist/manifest.json'),'utf8'));
const results=path.join(ROOT,'results');fs.mkdirSync(results,{recursive:true});
const save=(name,value)=>fs.writeFileSync(path.join(results,name+'.json'),JSON.stringify(value,null,2));
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ids=[...new Set(manifest.variants.map(v=>v.representative))];
const provenance=manifest.provenance;
const env=await environment();
const info={timestamp:new Date().toISOString(),provenance,browser:env.browser.version(),headless:process.env.HEADED!=='1',cpu:os.cpus()[0]?.model,platform:`${os.platform()} ${os.release()} ${os.arch()}`};
const progress=message=>{console.log(message);save('progress',{...info,message});};
function percentile(sorted,q){const i=(sorted.length-1)*q,lo=Math.floor(i),hi=Math.ceil(i);return sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo);}
function summary(samples){return Object.entries(samples).filter(([,v])=>v.rawMs.length).map(([id,v])=>{const s=[...v.rawMs].sort((a,b)=>a-b);return{id,...v,medianMs:percentile(s,.5),p25:percentile(s,.25),p75:percentile(s,.75)};}).sort((a,b)=>a.medianMs-b.medianMs);}
try{
 if(process.argv.includes('--verify')){
  const report={...info,passed:[],failures:[]};let reference;
  for(const id of ids){let page;try{
   const opened=await openVariant(env,id);page=opened.page;
   await page.locator('#add-box').click();await page.locator('#field-width').fill('80');await page.locator('#field-height').fill('50');await page.locator('#field-x').fill('100');await page.locator('#field-y').fill('100');await page.locator('#add-text').click();await page.locator('#field-text').fill('Editable label');assert.equal(await page.locator('[data-entity="shape-1"]').textContent(),'Editable label');await page.locator('[data-entity="shape-0"]').click();assert.equal(await page.locator('#field-width').inputValue(),'80');
   const result=await page.evaluate(()=>{let microtask=false;queueMicrotask(()=>{microtask=true;});const r=window.drawBench.verify();return{...r,microtask};});
   assert.equal(result.verifiedCommits,5000);assert.equal(result.microtask,false);assert.deepEqual(opened.errors,[]);
   const normalized={state:result.state,dom:result.dom};if(reference)assert.deepEqual(normalized,reference);else reference=normalized;
   report.passed.push({id,commits:5000,stateHash:hash(result.state),domHash:hash(result.dom)});
   if(id==='context-off')await page.screenshot({path:path.join(results,'baseline.png'),fullPage:true});
   progress(`Verified ${id} (${report.passed.length}/${ids.length}); ${report.failures.length} failures`);
  }catch(error){report.failures.push({id,error:error.stack});progress(`Verification FAILED ${id}: ${error.message.slice(0,240)}`);}finally{await page?.close();save('correctness',report);}}
 }else{
  const correct=JSON.parse(fs.readFileSync(path.join(results,'correctness.json'),'utf8'));
  assert.deepEqual(correct.provenance,provenance,'Build changed; rerun npm run verify');
  assert.equal(correct.passed.length + correct.failures.length, ids.length, 'Finish verification before benchmarking');
  let candidates=correct.passed.map(v=>v.id);
  const confirmation=process.argv.includes('--confirm');
  const warmups=Number(process.env.WARMUPS??2),trials=Number(process.env.TRIALS??(confirmation?9:3));
  assert.ok(Number.isInteger(warmups)&&warmups>=0&&Number.isInteger(trials)&&trials>=1);
  if(confirmation){
   const screen=JSON.parse(fs.readFileSync(path.join(results,'screen.json'),'utf8'));assert.deepEqual(screen.provenance,provenance);assert.equal(screen.complete,true,'Finish screening before confirmation');
   // Confirm top five for EACH architecture, plus on/off, all-on, and simple-list controls.
   const leaders=['context','store'].flatMap(arch=>screen.summary.filter(r=>r.id.startsWith(arch+'-')).slice(0,5).map(r=>r.id));
   const controls=['context-off','context-0','context-255','context-12','store-off','store-0','store-255','store-12'].map(id=>manifest.variants.find(v=>v.id===id)?.representative).filter(Boolean);
   candidates=[...new Set([...leaders,...controls])].filter(id=>candidates.includes(id));
  }
  if(process.env.VARIANTS)candidates=candidates.filter(id=>process.env.VARIANTS.split(',').includes(id));
  const samples=Object.fromEntries(candidates.map(id=>[id,{warmupMs:[],rawMs:[]}])) , order=[];
  // One persistent page per distinct configuration. Warm JIT before timed trials,
  // reset between runs, rotate order to distribute temporal drift.
  const opened=new Map();for(const id of candidates)opened.set(id,await openVariant(env,id));
  for(let round=0;round<warmups+trials;round++){
   for(let offset=0;offset<candidates.length;offset++){
    const id=candidates[(round+offset)%candidates.length];const{page,errors}=opened.get(id);
    await page.bringToFront();const run=await page.evaluate(()=>window.drawBench.runSuite({warmups:0,trials:1}));
    assert.equal(run.production,true);assert.deepEqual(errors,[]);const ms=run.rawMs[0];samples[id][round<warmups?'warmupMs':'rawMs'].push(ms);order.push({round,id,phase:round<warmups?'warmup':'trial',ms});
    progress(`${confirmation?'Confirm':'Screen'} ${round<warmups?'warmup':'trial'} ${round+1}/${warmups+trials}: ${id} ${ms.toFixed(1)} ms`);
    save(confirmation?'confirmation':'screen',{...info,warmups,trials,complete:false,order,summary:summary(samples)});
   }
  }
  const report={...info,warmups,trials,complete:true,order,summary:summary(samples)};save(confirmation?'confirmation':'screen',report);
  const winner=report.summary[0];progress(`${confirmation?'Confirmation':'Screening'} complete. Fastest measured correct: ${winner.id}, ${winner.medianMs.toFixed(1)} ms median.`);
  if(confirmation)await opened.get(winner.id).page.screenshot({path:path.join(results,'winner.png'),fullPage:true});
 }
}finally{await env.close();}
