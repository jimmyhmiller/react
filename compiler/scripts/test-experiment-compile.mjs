/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const cli = fileURLToPath(new URL('./experiment-compile.mjs', import.meta.url));

function prune(source, args = []) {
  const directory = mkdtempSync(
    path.join(tmpdir(), 'react-experiment-compile-')
  );
  try {
    const file = path.join(directory, 'input.jsx');
    writeFileSync(file, source);
    return execFileSync(
      process.execPath,
      [cli, file, '--off', '--prune', ...args],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

test('pruning keeps module and initializer side effects', () => {
  const output = prune(`
    import './effects.js';
    import {unused} from './other-effects.js';
    const discarded = notify();
    const pure = 42;
    function Unused() { return null; }
    export function App() { return <p>hello</p>; }
  `);
  assert.match(output, /import ['"]\.\/effects\.js['"]/);
  assert.match(output, /import ['"]\.\/other-effects\.js['"]/);
  assert.match(output, /notify\(\)/);
  assert.doesNotMatch(output, /\bunused\b|\bpure\b|\bUnused\b/);
  assert.match(output, /function App/);
});

test('pruning keeps the dependencies of an explicit root', () => {
  const output = prune(
    `
    const label = 'hello';
    function Row() { return <p>{label}</p>; }
    function App() { return <Row />; }
    function Other() { return null; }
  `,
    ['--root', 'App']
  );
  assert.match(output, /const label/);
  assert.match(output, /function Row/);
  assert.match(output, /function App/);
  assert.doesNotMatch(output, /function Other/);
});
