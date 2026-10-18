import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { environment, openVariant } from './browser.mjs';
import { ROOT } from './config.mjs';
import fs from 'node:fs';
import path from 'node:path';
const confirmation = JSON.parse(fs.readFileSync(path.join(ROOT, 'results/confirmation.json'), 'utf8'));
const candidates = process.argv.length > 2 ? process.argv.slice(2) : ['context-off', ...['context','store'].map(arch => confirmation.summary.find(row => row.id.startsWith(arch + '-')).id)];
// Separate diagnostic run; tracing overhead never enters reported benchmark results.
const env = await environment();
const report = {};
try {
  for (const variant of candidates) {
    const { page } = await openVariant(env, variant);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing', transferMode: 'ReturnAsStream' });
    await page.evaluate(() => {
      performance.mark('draw-diagnostic-start');
      window.drawBench.runTrial();
      performance.mark('draw-diagnostic-end');
    });
    const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
    await cdp.send('Tracing.end');
    const { stream } = await complete;
    let content = '';
    for (;;) {
      const chunk = await cdp.send('IO.read', { handle: stream });
      content += chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString() : chunk.data;
      if (chunk.eof) break;
    }
    await cdp.send('IO.close', { handle: stream });
    const events = JSON.parse(content).traceEvents;
    const start = events.find(e => e.name === 'draw-diagnostic-start');
    const end = events.find(e => e.name === 'draw-diagnostic-end');
    assert.ok(start && end);
    const forbidden = events.filter(e => e.pid === start.pid && e.tid === start.tid && e.ts >= start.ts && e.ts < end.ts && ['Layout', 'Paint', 'UpdateLayoutTree'].includes(e.name));
    assert.deepEqual(forbidden, []);
    report[variant] = { layoutEvents: 0, paintEvents: 0, updateLayoutTreeEvents: 0, diagnosticOnly: true, note: 'Chrome tracing surrounds reset and synchronous action loop; these instrumented durations are not benchmark results.' };
    await page.close();
    console.log(`${variant}: no Layout, Paint, or UpdateLayoutTree inside diagnostic interval`);
  }
  await writeFile(path.join(ROOT, process.argv.length > 2 ? 'results/layout-check-custom.json' : 'results/layout-check.json'), JSON.stringify(report, null, 2) + '\n');
} finally { await env.close(); }
