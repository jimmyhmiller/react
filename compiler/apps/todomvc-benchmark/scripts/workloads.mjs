/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Each workload runs entirely inside the page. `setup` is untimed; each step
// is timed from its first DOM event until the next frame has been produced
// (requestAnimationFrame followed by a macrotask), which includes rendering,
// commit, style, layout and paint. `verify` asserts that the step did what it
// claims, for every variant.
//
// Every dispatched event is followed by a microtask yield. React 19 processes
// updates from discrete events such as keydown in a microtask, so dispatching
// a burst of events synchronously would let React batch them into far fewer
// renders than real input (where each event is its own task) produces.

// In-page helpers, serialized into the page before workloads run.
export const PAGE_HELPERS = String.raw`
window.__bench = {
  async setInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', {bubbles: true}));
    await null;
  },
  async pressKey(element, key) {
    element.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true}));
    await null;
  },
  async click(element) {
    element.click();
    await null;
  },
  async doubleClick(element) {
    element.dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
    await null;
  },
  async addTodos(count, prefix) {
    const input = document.querySelector('.new-todo');
    for (let i = 0; i < count; i++) {
      await this.setInputValue(input, prefix + ' ' + i);
      await this.pressKey(input, 'Enter');
    }
  },
  async clickEach(selector, limit) {
    const elements = Array.from(document.querySelectorAll(selector)).slice(0, limit);
    for (const element of elements) {
      await this.click(element);
    }
  },
  async clickFilter(name) {
    const link = Array.from(document.querySelectorAll('.filters a')).find(a => a.textContent === name);
    await this.click(link);
  },
  nextFrame() {
    return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
  },
  count(selector) {
    return document.querySelectorAll(selector).length;
  },
  assert(condition, message) {
    if (!condition) {
      throw new Error('Benchmark verification failed: ' + message);
    }
  },
};
`;

// Page structure of each app: a selector that exists once the app has
// rendered, and the element whose DOM verify.mjs compares.
export const APP_PAGES = {
  todomvc: {ready: '.new-todo', root: '.todoapp'},
  rows: {ready: '#run', root: '.container'},
};

export const WORKLOADS = [
  {
    // The step sequence of developit/preact-perf (Speedometer 1 TodoMVC).
    app: 'todomvc',
    name: 'todomvc-100',
    description: 'preact-perf steps: add 100, complete each, delete each',
    setup: '',
    steps: [
      {
        name: 'add-100',
        run: `await __bench.addTodos(100, 'Something to do');`,
        verify: `__bench.assert(__bench.count('.todo-list li') === 100, 'expected 100 todos');`,
      },
      {
        name: 'complete-each',
        run: `await __bench.clickEach('.toggle', Infinity);`,
        verify: `__bench.assert(__bench.count('.todo-list li.completed') === 100, 'expected 100 completed');`,
      },
      {
        name: 'delete-each',
        run: `await __bench.clickEach('.destroy', Infinity);`,
        verify: `__bench.assert(__bench.count('.todo-list li') === 0, 'expected no todos');`,
      },
    ],
  },
  {
    app: 'todomvc',
    name: 'add-1000',
    description: 'add 1000 todos one at a time (each add renders the growing list)',
    setup: '',
    steps: [
      {
        name: 'add-1000',
        run: `await __bench.addTodos(1000, 'Task');`,
        verify: `__bench.assert(__bench.count('.todo-list li') === 1000, 'expected 1000 todos');`,
      },
    ],
  },
  {
    app: 'todomvc',
    name: 'toggle-200-of-1000',
    description: 'with 1000 todos, toggle 200 items one click at a time',
    setup: `await __bench.addTodos(1000, 'Task');`,
    steps: [
      {
        name: 'toggle-200',
        run: `await __bench.clickEach('.toggle', 200);`,
        verify: `__bench.assert(__bench.count('.todo-list li.completed') === 200, 'expected 200 completed');`,
      },
    ],
  },
  {
    app: 'todomvc',
    name: 'toggle-all-1000',
    description: 'with 1000 todos, click toggle-all 20 times',
    setup: `await __bench.addTodos(1000, 'Task');`,
    steps: [
      {
        name: 'toggle-all-x20',
        run: `for (let i = 0; i < 20; i++) { await __bench.click(document.querySelector('.toggle-all')); }`,
        verify: `__bench.assert(__bench.count('.todo-list li.completed') === 0, 'expected 0 completed after an even number of toggles');`,
      },
    ],
  },
  {
    app: 'todomvc',
    name: 'filter-cycle-1000',
    description: 'with 1000 todos (half completed), cycle Active/Completed/All 10 times',
    setup: `await __bench.addTodos(1000, 'Task'); const toggles = Array.from(document.querySelectorAll('.toggle')); for (let i = 0; i < toggles.length; i += 2) { await __bench.click(toggles[i]); }`,
    steps: [
      {
        name: 'filter-cycle-x10',
        run: `for (let i = 0; i < 10; i++) { await __bench.clickFilter('Active'); await __bench.clickFilter('Completed'); await __bench.clickFilter('All'); }`,
        verify: `__bench.assert(__bench.count('.todo-list li') === 1000, 'expected all 1000 visible');`,
      },
    ],
  },
  {
    app: 'todomvc',
    name: 'edit-one-of-1000',
    description: 'with 1000 todos, edit one title: start editing, type 30 characters, save',
    setup: `await __bench.addTodos(1000, 'Task');`,
    steps: [
      {
        name: 'edit-type-save',
        run: `
          const label = document.querySelectorAll('.todo-list li label')[500];
          await __bench.doubleClick(label);
          const input = document.querySelector('.todo-list li .edit');
          let text = input.value;
          for (let i = 0; i < 30; i++) { text += 'x'; await __bench.setInputValue(input, text); }
          await __bench.pressKey(input, 'Enter');
        `,
        verify: `__bench.assert(document.querySelectorAll('.todo-list li label')[500].textContent === 'Task 500' + 'x'.repeat(30), 'expected edited title'); __bench.assert(__bench.count('.todo-list li .edit') === 0, 'expected editing to end');`,
      },
    ],
  },
  {
    app: 'todomvc',
    name: 'clear-completed-1000',
    description: 'with 1000 completed todos, click clear completed',
    setup: `await __bench.addTodos(1000, 'Task'); await __bench.click(document.querySelector('.toggle-all'));`,
    steps: [
      {
        name: 'clear-completed',
        run: `await __bench.click(document.querySelector('.clear-completed'));`,
        verify: `__bench.assert(__bench.count('.todo-list li') === 0, 'expected no todos');`,
      },
    ],
  },

  // The operations of js-framework-benchmark (keyed), each on a fresh page.
  {
    app: 'rows',
    name: 'rows-create-1k',
    description: 'create 1,000 rows',
    setup: '',
    steps: [
      {
        name: 'create-1k',
        run: `await __bench.click(document.getElementById('run'));`,
        verify: `__bench.assert(__bench.count('tbody tr') === 1000, 'expected 1000 rows');`,
      },
    ],
  },
  {
    app: 'rows',
    name: 'rows-replace-1k',
    description: 'replace all 1,000 rows (x5)',
    setup: `await __bench.click(document.getElementById('run'));`,
    steps: [
      {
        name: 'replace-1k-x5',
        run: `for (let i = 0; i < 5; i++) { await __bench.click(document.getElementById('run')); }`,
        verify: `__bench.assert(__bench.count('tbody tr') === 1000, 'expected 1000 rows');`,
      },
    ],
  },
  {
    app: 'rows',
    name: 'rows-partial-update',
    description: 'update every 10th row of 1,000 rows (x10)',
    setup: `await __bench.click(document.getElementById('run'));`,
    steps: [
      {
        name: 'update-every-10th-x10',
        run: `for (let i = 0; i < 10; i++) { await __bench.click(document.getElementById('update')); }`,
        verify: `__bench.assert(document.querySelector('tbody tr td:nth-child(2) a').textContent.endsWith(' !!! !!! !!! !!! !!! !!! !!! !!! !!! !!!'), 'expected updated labels');`,
      },
    ],
  },
  {
    app: 'rows',
    name: 'rows-select',
    description: 'select 20 different rows of 1,000 rows',
    setup: `await __bench.click(document.getElementById('run'));`,
    steps: [
      {
        name: 'select-x20',
        run: `const links = document.querySelectorAll('tbody tr td:nth-child(2) a'); for (let i = 0; i < 20; i++) { await __bench.click(links[i * 37]); }`,
        verify: `__bench.assert(__bench.count('tbody tr.danger') === 1, 'expected one selected row');`,
      },
    ],
  },
  {
    app: 'rows',
    name: 'rows-swap',
    description: 'swap rows 2 and 999 of 1,000 rows (x10)',
    setup: `await __bench.click(document.getElementById('run'));`,
    steps: [
      {
        name: 'swap-x10',
        run: `for (let i = 0; i < 10; i++) { await __bench.click(document.getElementById('swaprows')); }`,
        verify: `__bench.assert(__bench.count('tbody tr') === 1000, 'expected 1000 rows');`,
      },
    ],
  },
  {
    app: 'rows',
    name: 'rows-remove',
    description: 'remove 10 rows of 1,000 rows',
    setup: `await __bench.click(document.getElementById('run'));`,
    steps: [
      {
        name: 'remove-x10',
        run: `for (let i = 0; i < 10; i++) { await __bench.click(document.querySelectorAll('tbody tr td:nth-child(3) a')[i * 50]); }`,
        verify: `__bench.assert(__bench.count('tbody tr') === 990, 'expected 990 rows');`,
      },
    ],
  },
  {
    app: 'rows',
    name: 'rows-create-10k',
    description: 'create 10,000 rows',
    setup: '',
    steps: [
      {
        name: 'create-10k',
        run: `await __bench.click(document.getElementById('runlots'));`,
        verify: `__bench.assert(__bench.count('tbody tr') === 10000, 'expected 10000 rows');`,
      },
    ],
  },
  {
    app: 'rows',
    name: 'rows-append-1k',
    description: 'append 1,000 rows to 1,000 rows',
    setup: `await __bench.click(document.getElementById('run'));`,
    steps: [
      {
        name: 'append-1k',
        run: `await __bench.click(document.getElementById('add'));`,
        verify: `__bench.assert(__bench.count('tbody tr') === 2000, 'expected 2000 rows');`,
      },
    ],
  },
  {
    app: 'rows',
    name: 'rows-clear-1k',
    description: 'clear 1,000 rows',
    setup: `await __bench.click(document.getElementById('run'));`,
    steps: [
      {
        name: 'clear-1k',
        run: `await __bench.click(document.getElementById('clear'));`,
        verify: `__bench.assert(__bench.count('tbody tr') === 0, 'expected no rows');`,
      },
    ],
  },
];
