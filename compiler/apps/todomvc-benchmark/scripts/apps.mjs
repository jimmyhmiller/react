/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// The benchmark apps. React variants compile `source` (the file with the
// app's components) and bundle `entry`; other frameworks bundle their entry in
// `frameworkEntries`, if the app has one for them. Paths are relative to src/,
// except `css`, which is relative to this package.
export const APPS = [
  {
    name: 'todomvc',
    source: 'TodoApp.jsx',
    entry: 'todomvc-main.jsx',
    frameworkEntries: {
      solid: 'solid/todomvc-main.jsx',
      svelte: 'svelte/todomvc-main.js',
      vue: 'vue/todomvc-main.js',
    },
    css: 'node_modules/todomvc-app-css/index.css',
  },
  {
    name: 'rows',
    source: 'RowsApp.jsx',
    entry: 'rows-main.jsx',
    frameworkEntries: {
      solid: 'solid/rows-main.jsx',
      svelte: 'svelte/rows-main.js',
      vue: 'vue/rows-main.js',
    },
    css: 'src/rows.css',
  },
  // The same project board with different state management.
  {
    name: 'board-context',
    source: 'board/ContextBoardApp.jsx',
    entry: 'board/context-main.jsx',
    css: 'src/board/board.css',
  },
  {
    name: 'board-zustand',
    source: 'board/ZustandBoardApp.jsx',
    entry: 'board/zustand-main.jsx',
    css: 'src/board/board.css',
  },
  {
    name: 'board-redux',
    source: 'board/ReduxBoardApp.jsx',
    entry: 'board/redux-main.jsx',
    css: 'src/board/board.css',
  },
];
