import fs from 'node:fs';
import assert from 'node:assert/strict';
import {ROOT} from './config.mjs';
import {environment,openVariant} from './browser.mjs';
const env=await environment(),ids=['results/key-20-off','results/key-20-on','results/key-222-off','results/key-222-on'],pages=new Map(),samples={},correctness=[];
try{
 let reference;
 for(const id of ids){const entry=await openVariant(env,id);pages.set(id,entry);samples[id]=[];const r=await entry.page.evaluate(()=>window.drawBench.verify());assert.equal(r.verifiedCommits,5000);const output={state:r.state,dom:r.dom};if(reference)assert.deepEqual(output,reference);else reference=output;assert.deepEqual(entry.errors,[]);correctness.push({id,commits:5000});console.log('verified',id);}
 for(let round=0;round<5;round++)for(let j=0;j<ids.length;j++){
 const id=ids[(round+j)%ids.length],{page,errors}=pages.get(id);await page.bringToFront();const r=await page.evaluate(()=>window.drawBench.runSuite({warmups:0,trials:1}));assert.deepEqual(errors,[]);if(round>=2)samples[id].push(r.medianMs);console.log(round,id,r.medianMs);
 }
 console.log(samples);fs.writeFileSync(ROOT+'/results/key-screen.json',JSON.stringify({correctness,samples},null,2));
}finally{await env.close();}
