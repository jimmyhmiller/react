/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const DEMO_SOURCE = path.join(ROOT, 'src', 'demo');
const DEMO_DIST = path.join(DIST, 'demo');

const BASE_VARIANT = {
  id: 'no-compiler',
  label: 'React · compiler off',
  path: 'local/no-compiler',
  features: null,
  description: 'Plain React: every add maps and reconciles the entire growing list.',
};

const COMBINATIONS = [
  {
    id: 'compiler',
    path: 'local/compiler',
    features: {inlining: false, blocks: false, lists: false, incremental: false},
  },
  {
    id: 'compiler-inlining',
    path: 'local/compiler-inlining',
    features: {inlining: true, blocks: false, lists: false, incremental: false},
  },
  {
    id: 'compiler-blocks',
    path: 'local/compiler-blocks',
    features: {inlining: false, blocks: true, lists: false, incremental: false},
  },
  {
    id: 'compiler-inlining-blocks',
    path: 'local/compiler-inlining-blocks',
    features: {inlining: true, blocks: true, lists: false, incremental: false},
  },
  {
    id: 'compiler-lists',
    path: 'local/compiler-lists',
    features: {inlining: false, blocks: false, lists: true, incremental: false},
  },
  {
    id: 'compiler-inlining-lists',
    path: 'local/compiler-inlining-lists',
    features: {inlining: true, blocks: false, lists: true, incremental: false},
  },
  {
    id: 'compiler-blocks-lists',
    path: 'local/compiler-blocks-lists',
    features: {inlining: false, blocks: true, lists: true, incremental: false},
  },
  {
    id: 'compiler-inlining-blocks-lists',
    path: 'local/compiler-inlining-blocks-lists',
    features: {inlining: true, blocks: true, lists: true, incremental: false},
  },
  {
    id: 'compiler-lists-incremental',
    path: 'local/compiler-lists-incremental',
    features: {inlining: false, blocks: false, lists: true, incremental: true},
  },
  {
    id: 'compiler-inlining-lists-incremental',
    path: 'local/compiler-inlining-lists-incremental',
    features: {inlining: true, blocks: false, lists: true, incremental: true},
  },
  {
    id: 'compiler-blocks-lists-incremental',
    path: 'local/compiler-blocks-lists-incremental',
    features: {inlining: false, blocks: true, lists: true, incremental: true},
  },
  {
    id: 'compiler-inlining-blocks-lists-incremental',
    path: 'local/compiler-inlining-blocks-lists-incremental',
    features: {inlining: true, blocks: true, lists: true, incremental: true},
  },
];

function featureLabel(features) {
  const enabled = Object.entries(features)
    .filter(([, value]) => value)
    .map(([name]) => name);
  return enabled.length === 0 ? 'Compiler only' : enabled.join(' + ');
}

const VARIANTS = [
  BASE_VARIANT,
  ...COMBINATIONS.map(variant => ({
    ...variant,
    label: featureLabel(variant.features),
    description:
      variant.features.incremental
        ? 'The compiler reuses unchanged mapped prefixes and suffixes; appending one row runs the list callback once.'
        : variant.features.lists
          ? 'Each row has its own memo cache, but every add still visits the whole array.'
          : variant.features.blocks
            ? 'Host JSX is emitted as compiled DOM blocks; list traversal still grows every add.'
            : variant.features.inlining
              ? 'Small component calls are fused into their parent before memoization.'
              : 'The standard compiler memoizes stable values, with no experimental passes enabled.',
  })),
];

function newestBenchmarkResult() {
  const resultsDir = path.join(ROOT, 'results');
  if (!fs.existsSync(resultsDir)) {
    return null;
  }
  const candidates = fs
    .readdirSync(resultsDir)
    .filter(file => file.endsWith('.json'))
    .map(file => path.join(resultsDir, file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  for (const filename of candidates) {
    const result = JSON.parse(fs.readFileSync(filename, 'utf8'));
    const rows =
      result.summary?.filter(row => row.step === 'minimal-add-2000/add-2000') ?? [];
    if (VARIANTS.every(variant => rows.some(row => row.variant === variant.path))) {
      return {result, rows};
    }
  }
  return null;
}

function readRequired(filename) {
  if (!fs.existsSync(filename)) {
    throw new Error(`Build the benchmark variants before the demo; missing ${filename}`);
  }
  return fs.readFileSync(filename, 'utf8');
}

export function buildDemo() {
  fs.mkdirSync(DEMO_DIST, {recursive: true});
  for (const filename of ['index.html', 'demo.css', 'demo.js']) {
    fs.copyFileSync(path.join(DEMO_SOURCE, filename), path.join(DEMO_DIST, filename));
  }

  const benchmark = newestBenchmarkResult();
  const originalSource = readRequired(path.join(ROOT, 'src', 'AddRowsApp.jsx'));
  const data = {
    measuredAt: benchmark?.result.date ?? null,
    browser: benchmark?.result.browser ?? null,
    iterations: benchmark?.result.iterations ?? null,
    variants: VARIANTS.map(variant => {
      const result = benchmark?.rows.find(row => row.variant === variant.path);
      return {
        ...variant,
        appUrl: `../${variant.path}/add-rows/index.html`,
        referenceMedian: result?.median ?? null,
        referenceP25: result?.p25 ?? null,
        referenceP75: result?.p75 ?? null,
        source: originalSource,
        generated: readRequired(
          path.join(DIST, variant.path, 'add-rows', 'AddRowsApp.compiled.js'),
        ),
      };
    }),
  };
  fs.writeFileSync(
    path.join(DEMO_DIST, 'demo-data.js'),
    `window.__ADD_ROWS_DEMO__ = ${JSON.stringify(data)};\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildDemo();
}
