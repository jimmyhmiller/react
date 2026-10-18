import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {ROOT} from './config.mjs';
import {environment,openVariant} from './browser.mjs';
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'results/key-manifest.json'),'utf8'));
const env=await environment(),report={manifest,passed:[],failures:[]};
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
try{
 let reference;
 for(const id of ['context-20',...manifest.variants.map(v=>'results/'+v.id)]){
  const {page,errors}=await openVariant(env,id);
  try{
   const r=await page.evaluate(()=>{let yielded=false;queueMicrotask(()=>{yielded=true;});return{...window.drawBench.verify(),yielded};});
   assert.equal(r.verifiedCommits,5000);assert.equal(r.yielded,false);
   const result={state:r.state,dom:r.dom};if(reference)assert.deepEqual(result,reference);else reference=result;
   for(const [id,width] of [['shape-0',75],['shape-500',85],['shape-31',95],['shape-16',105],['shape-999',115]]){
    await page.locator(`[data-entity="${id}"]`).evaluate(node=>node.click());
    await page.locator('#field-width').fill(String(width));
    assert.equal(await page.locator(`[data-entity="${id}"]`).evaluate(node=>node.style.width),width+'px');
   }
   await page.locator('#field-text').fill('Scoped label');assert.equal(await page.locator('[data-entity="shape-999"]').textContent(),'Scoped label');
   await page.locator('#reset').click();assert.equal(await page.locator('[data-entity]').count(),0);
   await page.locator('#add-box').click();await page.locator('#field-width').fill('42');assert.equal(await page.locator('[data-entity="shape-0"]').evaluate(node=>node.style.width),'42px');
   assert.deepEqual(errors,[]);report.passed.push({id,commits:r.verifiedCommits,stateHash:hash(r.state),domHash:hash(r.dom),crossPartitionEdits:true,resetAndRemount:true,noYield:true});console.log('PASS',id);
  }catch(e){report.failures.push({id,error:e.stack});console.error('FAIL',id,e.message);}finally{await page.close();}
 }
 fs.writeFileSync(path.join(ROOT,'results/key-correctness.json'),JSON.stringify(report,null,2));
 assert.equal(report.failures.length,0);
}finally{await env.close();}
