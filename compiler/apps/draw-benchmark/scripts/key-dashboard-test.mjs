import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT} from './config.mjs';
import {environment} from './browser.mjs';
const env=await environment();
try{
 const page=await env.browser.newPage({viewport:{width:1400,height:1100}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto(env.base);
 await page.locator('#key-load').click();
 const frame=page.frameLocator('#editor');await frame.locator('#variant').filter({hasText:'key-20-on'}).waitFor();
 assert.match(await page.locator('#key-summary').textContent(),/Confirmed:/);
 await frame.locator('#add-box').click();await frame.locator('#field-width').fill('73');
 assert.equal(await frame.locator('[data-entity="shape-0"]').evaluate(n=>n.style.width),'73px');
 const child=page.frames().find(f=>f.url().includes('/results/key-20-on/'));
 await child.evaluate(()=>{window.drawBench.runTrial();window.drawBench.checkFinal();});
 await page.screenshot({path:path.join(ROOT,'results/key-dashboard.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(ROOT,'results/key-dashboard-test.json'),JSON.stringify({passed:true,selection:true,manualEdit:true,finalStateAndDOM:true,pageErrors:errors},null,2));
 console.log('Compiler key dashboard preview, manual edit, and final state/DOM pass');
}finally{await env.close();}
