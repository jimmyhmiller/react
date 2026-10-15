/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Requires this checkout's production React, React DOM and compiler runtime
// in build/node_modules. Exercise separate bundles, as an application does.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';

const require = createRequire(import.meta.url);
process.env.NODE_ENV = 'production';
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<!doctype html><div id="root"></div>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const React = require('../../build/node_modules/react');
const ReactDOM = require('../../build/node_modules/react-dom');
const {createRoot} = require('../../build/node_modules/react-dom/client');
const {
  unstable_useListItemMemoCache: useListItemMemoCache,
} = require('../../build/node_modules/react/compiler-runtime');

test('separate production bundles retain the changed-items fast path', () => {
  const row = ReactDOM.unstable_createBlockTemplate([
    'li',
    null,
    [['className', 0]],
    [{s: 1}],
  ]);
  const list = ReactDOM.unstable_createBlockTemplate([
    'ul',
    null,
    null,
    [{s: 0}],
  ]);
  const items = Array.from({length: 200}, (_, id) => id);
  let itemReads = 0;
  function List({selected}) {
    const cache = useListItemMemoCache();
    const callback = React.useCallback(
      id =>
        React.createElement(row, {
          key: id,
          v: [cache.matchesSelection(0, id) ? 'selected' : '', String(id)],
        }),
      [cache]
    );
    const result = cache.map(items, callback, [selected]);
    const observed = new Proxy(result, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) itemReads++;
        return Reflect.get(target, property, receiver);
      },
    });
    return React.createElement(list, {v: [observed]});
  }
  const container = document.getElementById('root');
  const root = createRoot(container);
  try {
    for (const selected of [0, 1]) {
      ReactDOM.flushSync(() =>
        root.render(React.createElement(List, {selected}))
      );
    }
    itemReads = 0;
    ReactDOM.flushSync(() =>
      root.render(React.createElement(List, {selected: 2}))
    );
    assert.equal(container.querySelector('.selected').textContent, '2');
    assert.equal(container.querySelectorAll('li').length, 200);
    assert.ok(
      itemReads < 100,
      `expected changed-item reads, observed ${itemReads}`
    );
  } finally {
    ReactDOM.flushSync(() => root.unmount());
    dom.window.close();
  }
});
