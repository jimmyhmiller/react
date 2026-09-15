/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// `framework` selects how a variant is built:
//
// - 'react': src/TodoApp.jsx and src/RowsApp.jsx, optionally compiled by the
//   Rust React Compiler with `compiler.environment`. `react` selects the React
//   build:
//   - 'npm':   the published packages installed in this directory.
//   - 'local': the build of this repository in <repo>/build/node_modules,
//              required for compiled blocks. Build it with:
//              RELEASE_CHANNEL=experimental node scripts/rollup/build.js \
//                react/index,react/jsx-runtime,react/compiler-runtime,react-dom/index,react-dom/client,scheduler/index \
//                --type=NODE_PROD
// - 'preact': the same React sources, uncompiled, rendered by Preact through
//   preact/compat.
// - 'solid', 'svelte', 'vue': idiomatic implementations in src/<framework>/
//   that render the same DOM, compiled by each framework's own compiler.
export const VARIANTS = [
  {name: 'no-compiler', framework: 'react', react: 'npm', compiler: null},
  {
    name: 'compiler',
    framework: 'react',
    react: 'npm',
    compiler: {environment: {}},
  },
  {
    name: 'compiler-inlining',
    framework: 'react',
    react: 'npm',
    compiler: {environment: {enableComponentInlining: true}},
  },
  {
    name: 'local/no-compiler',
    framework: 'react',
    react: 'local',
    compiler: null,
  },
  {
    name: 'local/compiler',
    framework: 'react',
    react: 'local',
    compiler: {environment: {}},
  },
  {
    name: 'local/compiler-inlining',
    framework: 'react',
    react: 'local',
    compiler: {environment: {enableComponentInlining: true}},
  },
  {
    name: 'local/compiler-blocks',
    framework: 'react',
    react: 'local',
    compiler: {environment: {enableJsxBlocks: true}},
  },
  {
    name: 'local/compiler-inlining-blocks',
    framework: 'react',
    react: 'local',
    compiler: {
      environment: {enableComponentInlining: true, enableJsxBlocks: true},
    },
  },
  {
    name: 'local/compiler-inlining-blocks-lists',
    framework: 'react',
    react: 'local',
    compiler: {
      environment: {
        enableComponentInlining: true,
        enableJsxBlocks: true,
        enableListItemMemoization: true,
      },
    },
  },
  {name: 'preact', framework: 'preact'},
  {name: 'solid', framework: 'solid'},
  {name: 'svelte', framework: 'svelte'},
  {name: 'vue', framework: 'vue'},
];

// The variant each variant's speedup is reported against: the React Compiler
// on the same React build, and for other frameworks the React Compiler on
// this repository's build (the build that compiled blocks use).
export function baselineFor(variant) {
  if (variant.framework === 'react' && variant.react === 'npm') {
    return 'compiler';
  }
  return 'local/compiler';
}
