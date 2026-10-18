import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = process.env.REACT_REPO ?? path.resolve(ROOT, '../../..');
export const COMPILER = path.join(REPO, 'compiler');
export const requireCompiler = createRequire(path.join(COMPILER, 'package.json'));
export const requireBrowser = createRequire(path.join(COMPILER, 'apps/todomvc-benchmark/package.json'));
export const FLAGS = [
  ['inlining', 'enableComponentInlining'],
  ['blocks', 'enableJsxBlocks'],
  ['lists', 'enableListItemMemoization'],
  ['incremental', 'enableIncrementalListMapping'],
  ['context', 'enableContextSelectors'],
  ['reads', 'enableSelectorReads'],
  ['slicing', 'enableUpdateSlicing'],
  ['islands', 'enableStaticIslands'],
];
export const VARIANTS = ['context', 'store'].flatMap(architecture => [
  {id: `${architecture}-off`, architecture, environment: null, mask: null, label: `${architecture} / compiler off`},
  ...Array.from({length: 256}, (_, mask) => mask)
    .filter(mask => (!(mask & 8) || mask & 4) && (!(mask & (32 | 64)) || mask & 16))
    .map(mask => ({
      id: `${architecture}-${mask}`, architecture, mask,
      environment: Object.fromEntries(FLAGS.map(([name, flag], index) => [flag, Boolean(mask & (1 << index))])),
      label: `${architecture} / ${FLAGS.filter((_, index) => mask & (1 << index)).map(([name]) => name).join(' + ') || 'compiler only'}`,
    })),
]);
