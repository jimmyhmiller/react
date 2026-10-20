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
const {
  createServerPreloadRequest,
  createServerPreloadTrace,
} = require('react-compiler-runtime/server');
const {Page} = require(process.argv[2]);
async function render() {
  const trace = createServerPreloadTrace();
  const request = createServerPreloadRequest({
    maxConcurrent: 1,
    onEvent: trace.onEvent,
  });
  const output = new PassThrough();
  let text = '';
  output.on('data', chunk => {
    text += chunk;
  });
  const done = new Promise((resolve, reject) => {
    output.on('end', resolve);
    output.on('error', reject);
  });
  try {
    request.run(() =>
      renderToPipeableStream(
        React.createElement(Page),
        {},
        {onError: error => output.destroy(error)}
      ).pipe(output)
    );
    await done;
    for (let id = 0; id < 20; id++) {
      assert(text.includes('AUTHOR_' + id));
    }
    const events = trace.snapshot().events;
    assert.equal(
      new Set(
        events
          .filter(event => event.kind === 'started')
          .map(event => event.operationId)
      ).size,
      1
    );
    assert(events.every(event => event.active <= 1));
  } finally {
    request.close();
  }
}
(async () => {
  globalThis.__batches = [];
  await render();
  assert.deepEqual(globalThis.__batches, [
    Array.from({length: 20}, (_, id) => id),
  ]);
  await render();
  assert.equal(
    globalThis.__batches.length,
    2,
    'separate requests must not share cached results'
  );
  process.stdout.write(
    'PASS Flight batch: 20 components, one backend operation, isolation, cap one\n'
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
