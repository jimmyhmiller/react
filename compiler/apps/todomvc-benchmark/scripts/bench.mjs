/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Runs every workload against every built variant in headless Chromium.
//
//   node scripts/bench.mjs [--iterations N] [--warmup N] [--workload NAME]...
//                          [--variant NAME]... [--chromium PATH]
//
// `--variant` limits the run to the named variants plus their baselines.
//
// Each sample uses a fresh browser context and page. Variants are interleaved
// round-robin within each iteration so that drift affects them equally.
// Results (raw samples and summaries) are written to results/<timestamp>.json.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {VARIANTS, baselineFor} from './variants.mjs';
import {APP_PAGES, PAGE_HELPERS, WORKLOADS} from './workloads.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {
    iterations: 10,
    warmup: 2,
    workloads: [],
    variants: [],
    chromium: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    switch (arg) {
      case '--iterations':
        args.iterations = Number(value);
        i++;
        break;
      case '--warmup':
        args.warmup = Number(value);
        i++;
        break;
      case '--workload':
        args.workloads.push(value);
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
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isInteger(args.iterations) || args.iterations < 1) {
    throw new Error('--iterations must be a positive integer');
  }
  return args;
}

async function runSample(browser, variant, workload) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const url = pathToFileURL(
      path.join(ROOT, 'dist', variant.name, workload.app, 'index.html'),
    ).href;
    await page.goto(url);
    await page.waitForSelector(APP_PAGES[workload.app].ready);
    await page.evaluate(PAGE_HELPERS);
    if (workload.setup !== '') {
      await page.evaluate(`(async () => { ${workload.setup}; await __bench.nextFrame(); })()`);
    }
    const steps = {};
    for (const step of workload.steps) {
      const duration = await page.evaluate(`(async () => {
        const start = performance.now();
        ${step.run}
        await __bench.nextFrame();
        const duration = performance.now() - start;
        ${step.verify}
        return duration;
      })()`);
      steps[step.name] = duration;
    }
    return steps;
  } finally {
    await context.close();
  }
}

function quantile(sorted, q) {
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    median: quantile(sorted, 0.5),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'manifest.json'), 'utf8'));
  const workloads =
    args.workloads.length === 0
      ? WORKLOADS
      : args.workloads.map(name => {
          const workload = WORKLOADS.find(w => w.name === name);
          if (workload == null) {
            throw new Error(`Unknown workload: ${name}`);
          }
          return workload;
        });

  let variants = VARIANTS;
  if (args.variants.length !== 0) {
    for (const name of args.variants) {
      if (!VARIANTS.some(v => v.name === name)) {
        throw new Error(`Unknown variant: ${name}`);
      }
    }
    const selected = new Set(args.variants);
    for (const name of args.variants) {
      selected.add(baselineFor(VARIANTS.find(v => v.name === name)));
    }
    variants = VARIANTS.filter(v => selected.has(v.name));
  }

  const browser = await chromium.launch({
    headless: true,
    ...(args.chromium != null ? {executablePath: args.chromium} : {}),
  });
  const samples = {};
  try {
    for (const workload of workloads) {
      console.log(`\n${workload.name}: ${workload.description}`);
      for (let i = 0; i < args.warmup + args.iterations; i++) {
        const measured = i >= args.warmup;
        for (const variant of variants) {
          const steps = await runSample(browser, variant, workload);
          if (!measured) {
            continue;
          }
          for (const [step, duration] of Object.entries(steps)) {
            const key = `${workload.name}/${step}`;
            samples[key] ??= {};
            (samples[key][variant.name] ??= []).push(duration);
          }
        }
        process.stdout.write(measured ? '.' : 'w');
      }
      process.stdout.write('\n');
    }
  } finally {
    await browser.close();
  }

  const summary = [];
  for (const [key, byVariant] of Object.entries(samples)) {
    for (const variant of variants) {
      const stats = summarize(byVariant[variant.name]);
      const baselineName = baselineFor(variant);
      summary.push({
        step: key,
        variant: variant.name,
        ...stats,
        baseline: baselineName,
        speedupVsBaseline: summarize(byVariant[baselineName]).median / stats.median,
      });
    }
  }

  const resultsDir = path.join(ROOT, 'results');
  fs.mkdirSync(resultsDir, {recursive: true});
  const outFile = path.join(resultsDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: browser.version(),
        iterations: args.iterations,
        warmup: args.warmup,
        variants: variants.map(v => v.name),
        manifest,
        summary,
        samples,
      },
      null,
      2,
    ),
  );

  console.log(
    '\nmedian ms (p25-p75), speedup vs the React Compiler on the same React build (other frameworks: vs local/compiler)',
  );
  for (const row of summary) {
    console.log(
      `${row.step.padEnd(36)} ${row.variant.padEnd(32)} ${row.median.toFixed(1).padStart(8)} (${row.p25.toFixed(1)}-${row.p75.toFixed(1)})  ${row.speedupVsBaseline.toFixed(2)}x`,
    );
  }
  // One row per step, one column per variant.
  const steps = [...new Set(summary.map(row => row.step))];
  const width = Math.max(...variants.map(v => v.name.length), 8) + 2;
  console.log('\nmedian ms by variant');
  console.log(''.padEnd(40) + variants.map(v => v.name.padStart(width)).join(''));
  for (const step of steps) {
    const cells = variants.map(v => {
      const row = summary.find(r => r.step === step && r.variant === v.name);
      return row.median.toFixed(1).padStart(width);
    });
    console.log(step.padEnd(40) + cells.join(''));
  }
  console.log(`\nWrote ${outFile}`);
}

await main();
