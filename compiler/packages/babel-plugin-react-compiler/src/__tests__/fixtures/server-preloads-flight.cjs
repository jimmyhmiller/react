/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

const assert = require('node:assert/strict');
const {PassThrough} = require('node:stream');
const React = require('react');
const {
  renderToPipeableStream,
} = require('react-server-dom-webpack/server.node');
const runtime = require('react-compiler-runtime/server');
const {Page} = require(process.argv[2]);
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {promise, resolve, reject};
}
function render(id, options = {}) {
  const controller = new AbortController();
  const output = new PassThrough();
  let text = '';
  const errors = [];
  output.on('data', chunk => {
    text += chunk;
  });
  const done = new Promise((resolve, reject) => {
    output.on('end', resolve);
    output.on('error', reject);
  });
  const invoke = () => {
    const stream = renderToPipeableStream(
      React.createElement(Page, {id}),
      {},
      {
        onError: error => {
          errors.push(error);
          return 'test-digest';
        },
      }
    );
    stream.pipe(output);
  };
  if (options.useDefault) {
    invoke();
  } else {
    runtime.runWithServerPreloads(
      {signal: controller.signal, ...options},
      invoke
    );
  }
  done.then(
    () => controller.abort(),
    () => controller.abort()
  );
  return {done, errors, text: () => text};
}
async function until(test) {
  for (let iteration = 0; iteration < 40 && !test(); iteration++) {
    await tick();
  }
  assert(test(), 'expected renderer progress');
}
(async () => {
  const trace = [];
  const product = deferred(),
    flags = deferred(),
    seller = deferred(),
    reviews = deferred();
  globalThis.__preloadFlightData = {
    getProduct: id => {
      trace.push(`product:${id}`);
      return product.promise;
    },
    getFlags: id => {
      trace.push(`flags:${id}`);
      return flags.promise;
    },
    getSeller: id => {
      trace.push(`seller:${id}`);
      return seller.promise;
    },
    getReviews: id => {
      trace.push(`reviews:${id}`);
      return reviews.promise;
    },
  };
  const request = render('one', {maxConcurrent: 2});
  await until(() => trace.length === 2);
  assert.deepEqual(trace, ['product:one', 'flags:one']);
  product.resolve({sellerId: 'seller', name: 'PRODUCT_PAYLOAD'});
  await until(() => trace.includes('seller:seller'));
  assert(
    !request.text().includes('PRODUCT_PAYLOAD'),
    'flags still block the original parent'
  );
  seller.resolve({reviewId: 'review'});
  await until(() => trace.includes('reviews:review'));
  flags.resolve('flags');
  await until(() => request.text().includes('PRODUCT_PAYLOAD'));
  assert(
    !request.text().includes('REVIEW_PAYLOAD'),
    'pending child should preserve streaming'
  );
  reviews.resolve('REVIEW_PAYLOAD');
  await request.done;
  assert(request.text().includes('REVIEW_PAYLOAD'));
  assert.deepEqual(request.errors, []);
  assert.deepEqual(
    trace,
    ['product:one', 'flags:one', 'seller:seller', 'reviews:review'],
    'preloads and original consumers must deduplicate'
  );
  const second = render('one', {useDefault: true});
  await second.done;
  assert.equal(
    trace.length,
    8,
    'a new request must have its own resource cache'
  );

  const firstError = new Error('product failure');
  const productFailure = deferred(),
    flagsFailure = deferred();
  globalThis.__preloadFlightData = {
    getProduct: () => productFailure.promise,
    getFlags: () => flagsFailure.promise,
    getSeller: () => {
      throw new Error('seller must stay dependent');
    },
    getReviews: () => {
      throw new Error('reviews must stay dependent');
    },
  };
  const failure = render('failure');
  await tick();
  flagsFailure.reject(new Error('unconsumed flags failure'));
  await tick();
  assert.deepEqual(failure.errors, []);
  productFailure.reject(firstError);
  await failure.done;
  assert.deepEqual(failure.errors, [firstError]);
  process.stdout.write(
    'PASS Flight graph: dependencies, helper/barrel plans, bounded concurrency, cache isolation, streaming and error delivery\n'
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
