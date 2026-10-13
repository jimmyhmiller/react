/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// The benchmark apps. React variants compile `source` (the file with the
// app's components) and the app's other `modules` (like its stores), and
// bundle `entry`; other frameworks bundle their entry in
// `frameworkEntries`, if the app has one for them. Paths are relative to src/,
// except `css`, which is relative to this package.
export const APPS = [
  {
    name: 'add-rows',
    source: 'AddRowsApp.jsx',
    entry: 'add-rows-main.jsx',
    css: 'src/add-rows.css',
  },
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
    modules: ['board/zustandStore.js'],
    entry: 'board/zustand-main.jsx',
    css: 'src/board/board.css',
  },
  // A documentation page: mostly static content with a few interactive parts,
  // for server rendering and hydration.
  {
    name: 'docs',
    source: 'docs/DocsApp.jsx',
    entry: 'docs/docs-main.jsx',
    css: 'src/docs/docs.css',
  },
  // 5,000 components subscribed to one Zustand store, for the cost of
  // notifying store listeners (shared store subscriptions).
  {
    name: 'listeners',
    source: 'listeners/ListenersApp.jsx',
    modules: ['listeners/listenersStore.js'],
    entry: 'listeners/listeners-main.jsx',
    css: 'src/listeners/listeners.css',
  },
  // The same 1,000 selectable cards with a Zustand store read by comparing in
  // render, by comparing in the selector, and with Jotai atoms.
  {
    name: 'select-zustand-render',
    source: 'select/ZustandRenderApp.jsx',
    modules: ['select/zustandStore.js'],
    entry: 'select/ZustandRender-main.jsx',
    css: 'src/select/select.css',
  },
  {
    name: 'select-zustand-selector',
    source: 'select/ZustandSelectorApp.jsx',
    modules: ['select/zustandStore.js'],
    entry: 'select/ZustandSelector-main.jsx',
    css: 'src/select/select.css',
  },
  {
    name: 'select-jotai',
    source: 'select/JotaiApp.jsx',
    modules: ['select/jotaiAtoms.js'],
    entry: 'select/Jotai-main.jsx',
    css: 'src/select/select.css',
  },
  {
    name: 'board-redux',
    source: 'board/ReduxBoardApp.jsx',
    modules: ['board/reduxStore.js'],
    entry: 'board/redux-main.jsx',
    css: 'src/board/board.css',
  },
];
