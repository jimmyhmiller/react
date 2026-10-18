import assert from 'node:assert/strict';
import path from 'node:path';
import {ROOT} from './config.mjs';
import {environment} from './browser.mjs';
const env=await environment();
try {
 const page=await env.browser.newPage({viewport:{width:1440,height:1100}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(env.base+'/');
 await page.frameLocator('#editor').locator('#add-box').waitFor();
 await page.locator('#flag-3').check();assert.equal(await page.locator('#flag-2').isChecked(),true);
 await page.locator('#flag-6').check();assert.equal(await page.locator('#flag-4').isChecked(),true);
 await page.locator('#flag-4').uncheck();assert.equal(await page.locator('#flag-6').isChecked(),false);
 await page.locator('#architecture').selectOption('store');
 await page.locator('#compiler').uncheck();await page.locator('#preview').click();
 await page.frameLocator('#editor').locator('#add-box').click();
 assert.equal(await page.frameLocator('#editor').locator('#revision').getAttribute('data-revision'),'1');
 await page.locator('#compiler').check();await page.locator('#flag-1').check();await page.locator('#preview').click();
 await page.frameLocator('#editor').locator('#add-text').click();await page.frameLocator('#editor').locator('#field-text').fill('Live variant');
 assert.equal(await page.frameLocator('#editor').locator('[data-entity="shape-0"]').textContent(),'Live variant');
 await page.locator('#result-mode').selectOption('screen');await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelectorAll('#results tr').length>70);await page.locator('#result-mode').selectOption('confirmation');await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelectorAll('#results tr').length>1&&document.querySelectorAll('#results tr').length<30);
 const frame=page.frames().find(frame=>frame.url().includes('/store-14/'));await frame.evaluate(()=>window.drawBench.verify());
 assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(ROOT,'results/dashboard.png'),fullPage:true});
 console.log('Dashboard dependency toggles, variant switching, iframe editor passed.');
} finally {await env.close();}
