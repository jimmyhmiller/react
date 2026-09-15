/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Measures the hydration of the React variants' server-rendered pages (see
// build.mjs): the time from hydrateRoot to the commit of the hydration, and the
// page's total script time (bundle evaluation included).
//
//   node scripts/hydration.mjs [--iterations N] [--app NAME]... [--variant NAME]... [--chromium PATH]

import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {APPS} from './apps.mjs';
import {VARIANTS, variantHasApp} from './variants.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {iterations: 15, apps: [], variants: [], chromium: null};
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    switch (argv[i]) {
      case '--iterations':
        args.iterations = Number(value);
        i++;
        break;
      case '--app':
        args.apps.push(value);
        i++;
        break;
      case '--variant':
        args.variants.push(value);
        i++;
        break;
      case '--chromium':
        args.chromium = value;
        i++;
        break;
      default:
        throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return args;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apps = APPS.filter(
    app => args.apps.length === 0 || args.apps.includes(app.name),
  );
  const variants = VARIANTS.filter(
    variant =>
      variant.framework === 'react' &&
      (args.variants.length === 0 || args.variants.includes(variant.name)),
  );
  const browser = await chromium.launch({
    headless: true,
    ...(args.chromium != null ? {executablePath: args.chromium} : {}),
  });
  try {
    for (const app of apps) {
      const results = new Map();
      for (let i = 0; i < args.iterations; i++) {
        for (const variant of variants) {
          if (!variantHasApp(variant, app)) {
            continue;
          }
          const context = await browser.newContext();
          const page = await context.newPage();
          const cdp = await context.newCDPSession(page);
          await cdp.send('Performance.enable');
          await page.goto(
            pathToFileURL(
              path.join(ROOT, 'dist', variant.name, app.name, 'ssr', 'index.html'),
            ).href,
          );
          await page.waitForSelector('body[data-hydrated]');
          const hydration = await page.evaluate(() => window.__hydrationTime);
          const {metrics} = await cdp.send('Performance.getMetrics');
          const script = metrics.find(m => m.name === 'ScriptDuration').value * 1000;
          await context.close();
          if (!results.has(variant.name)) {
            results.set(variant.name, {hydration: [], script: []});
          }
          results.get(variant.name).hydration.push(hydration);
          results.get(variant.name).script.push(script);
        }
      }
      console.log(`\n${app.name}: median ms (hydrateRoot to commit, total script)`);
      for (const [name, {hydration, script}] of results) {
        console.log(
          `  ${name.padEnd(36)} ${median(hydration).toFixed(1).padStart(7)} ${median(script).toFixed(1).padStart(7)}`,
        );
      }
    }
  } finally {
    await browser.close();
  }
}

await main();
