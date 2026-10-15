/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Build the Rust plugin first with `yarn snap --rust` from compiler/.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';

const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const plugin =
  require('../packages/babel-plugin-react-compiler-rust/dist').default;

function options() {
  return {
    babelrc: false,
    configFile: false,
    parserOpts: {plugins: ['jsx']},
    plugins: [
      [
        plugin,
        {
          panicThreshold: 'all_errors',
          environment: {enableStateVariables: true, enableJsxBlocks: true},
        },
      ],
    ],
  };
}

const component = `export function Counter() {
  let count = 0;
  return <button onClick={() => count++}><span>{count}</span></button>;
}`;

function checkCompiled(options) {
  const {code} = babel.transformSync(component, options);
  assert.match(
    code,
    /useState/,
    'state-variable semantics must be compiled in every file'
  );
  assert.match(
    code,
    /unstable_createBlockTemplate/,
    'every file must receive block optimization'
  );
  assert.equal(
    (code.match(/const \[count,/g) ?? []).length,
    1,
    'compile each Program only once'
  );
}

test('a reused Babel configuration compiles every file', () => {
  const config = options();
  checkCompiled(config);
  checkCompiled(config);
  checkCompiled(config);
});

test('skipping a non-React file does not skip later components', () => {
  const config = options();
  babel.transformSync('export const answer = 42;', config);
  checkCompiled(config);
});
