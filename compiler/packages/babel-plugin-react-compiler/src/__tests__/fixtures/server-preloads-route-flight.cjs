/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';
const assert = require('node:assert/strict');
const {PassThrough} = require('node:stream');
const {AsyncLocalStorage} = require('node:async_hooks');
const React = require('react');
const {
  renderToPipeableStream,
} = require('react-server-dom-webpack/server.node');
const {createServerPreloadRequest} = require('react-compiler-runtime/server');
const {Page, PageCatch, manifest} = require(process.argv[2]);
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {promise, resolve, reject};
}
async function until(test) {
  for (let i = 0; i < 50 && !test(); i++) {
    await tick();
  }
  assert(test(), 'expected Flight progress');
}
function render(owner, Component, id) {
  const output = new PassThrough(),
    errors = [];
  let text = '';
  output.on('data', chunk => {
    text += chunk;
  });
  const done = new Promise((resolve, reject) => {
    output.on('end', resolve);
    output.on('error', reject);
  });
  owner.run(() =>
    renderToPipeableStream(
      React.createElement(Component, {id}),
      {},
      {
        onError: error => {
          errors.push(error);
          return 'digest';
        },
      }
    ).pipe(output)
  );
  return {done, errors, text: () => text};
}
(async () => {
  const context = new AsyncLocalStorage();
  let native = deferred(),
    calls = [];
  globalThis.__routeRead = id => {
    calls.push([id, context.getStore()]);
    return native.promise;
  };
  const owner = createServerPreloadRequest({
    features: {routeManifests: true, preloading: false},
  });
  context.run('request-a', () =>
    owner.run(() => manifest.preload('reviews', {id: 'one'}))
  );
  await tick();
  assert.deepEqual(calls, [['one', 'request-a']]);
  const first = context.run('request-a', () => render(owner, Page, 'one'));
  await tick();
  assert(!first.text().includes('SHELL'));
  native.resolve('REVIEWS');
  await first.done;
  assert(first.text().includes('REVIEWS'));
  assert.equal(calls.length, 1);
  owner.close();

  native = deferred();
  calls = [];
  const enabled = createServerPreloadRequest({
    features: {deferAwait: true, preloading: false},
  });
  const second = render(enabled, Page, 'two');
  await until(() => second.text().includes('SHELL'));
  assert(!second.text().includes('REVIEWS'));
  native.resolve('REVIEWS');
  await second.done;
  assert.equal(calls.length, 1);
  assert.deepEqual(second.errors, []);
  enabled.close();

  native = deferred();
  const failed = createServerPreloadRequest({
    features: {deferAwait: true, preloading: false},
  });
  const error = new Error('reviews failed');
  const third = render(failed, Page, 'failed');
  await until(() => third.text().includes('SHELL'));
  native.reject(error);
  await third.done;
  assert.deepEqual(third.errors, [error]);
  failed.close();

  native = deferred();
  const caught = createServerPreloadRequest({
    features: {deferAwait: true, preloading: false},
  });
  const fourth = render(caught, PageCatch, 'caught');
  await tick();
  native.reject(error);
  await fourth.done;
  assert(fourth.text().includes('CAUGHT'));
  assert.deepEqual(fourth.errors, []);
  caught.close();

  native = deferred();
  const prefetched = createServerPreloadRequest({
    features: {routeManifests: true, preloading: false},
  });
  prefetched.run(() => manifest.preload('reviews', {id: 'prefetched-error'}));
  native.reject(error);
  await tick();
  const fifth = render(prefetched, Page, 'prefetched-error');
  await fifth.done;
  assert.deepEqual(fifth.errors, [error]);
  prefetched.close();
  native = deferred();
  const combined = createServerPreloadRequest({
    features: {routeManifests: true, deferAwait: true, preloading: false},
  });
  const count = calls.length;
  combined.run(() => manifest.preload('reviews', {id: 'combined'}));
  native.reject(error);
  await tick();
  const sixth = render(combined, Page, 'combined');
  await sixth.done;
  assert(sixth.text().includes('SHELL'));
  assert.deepEqual(sixth.errors, [error]);
  assert.equal(calls.length, count + 1);
  combined.close();
  process.stdout.write(
    'PASS Flight route/deferred: pre-render sharing, context, toggles, streaming, consumed errors and retained catches\n'
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
