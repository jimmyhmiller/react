import {requireBrowser} from './config.mjs';
import {startServer} from './serve.mjs';
const {chromium} = requireBrowser('playwright');
export async function environment() {
  const server = await startServer(0);
  try {
    const browser = await chromium.launch({channel: process.env.BROWSER_CHANNEL ?? 'chrome', headless: process.env.HEADED !== '1'});
    return {browser, base: `http://127.0.0.1:${server.address().port}`, close: async () => {await browser.close(); await new Promise(resolve=>server.close(resolve));}};
  } catch(error) {server.close();throw error;}
}
export async function openVariant(env, id) {
  const page = await env.browser.newPage({viewport:{width:1280,height:1100},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  page.on('console', message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(`${env.base}/${id}/`);
  try { await page.waitForFunction(()=>window.drawBench, null, {timeout: 10000}); } catch(error) { await page.close(); throw new Error(`${id} startup failed: ${errors.join('; ')}; ${error.message}`); }
  return {page,errors};
}
