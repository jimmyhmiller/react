/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {defineConfig} from 'tsup';

export default defineConfig({
  entry: ['./src/index.ts', './src/esbuild.ts', './src/server.ts'],
  outDir: './dist',
  external: ['@babel/types'],
  splitting: false,
  sourcemap: false,
  dts: {
    entry: ['./src/esbuild.ts', './src/server.ts'],
    compilerOptions: {ignoreDeprecations: '5.0'},
  },
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'es2015',
  banner: {
    js: `/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @lightSyntaxTransform
 * @noflow
 * @nolint
 * @preventMunge
 * @preserve-invariant-messages
 */`,
  },
});
