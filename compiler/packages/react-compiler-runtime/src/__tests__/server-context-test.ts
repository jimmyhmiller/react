/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createServerPreloadRequest,
  getServerPreloadSignal,
  read,
  runWithServerPreloads,
  preload,
} from '../server';

it('gives a streaming host explicit lifetime ownership without blocking its callback', async () => {
  const owner = createServerPreloadRequest({maxConcurrent: 1});
  let reject!: (error: unknown) => void;
  const native = new Promise<string>((_resolve, no) => {
    reject = no;
  });
  const resource = jest.fn(() => {
    expect(getServerPreloadSignal()).toBe(owner.signal);
    return native;
  });
  const result = owner.run(() => read(resource, ['id']));
  const reason = new Error('response ended');
  owner.close(reason);
  await expect(result).rejects.toBe(reason);
  reject(new Error('native owner ended I/O'));
  await new Promise(resolve => setImmediate(resolve));
  expect(resource).toHaveBeenCalledTimes(1);
});

it('joins an existing request abort signal and keeps other requests independent', async () => {
  const parent = new AbortController();
  const one = createServerPreloadRequest({signal: parent.signal});
  const two = createServerPreloadRequest();
  parent.abort('ended');
  expect(one.signal.aborted).toBe(true);
  expect(two.signal.aborted).toBe(false);
  await expect(
    two.run(() => read(() => Promise.resolve('ok'), [])),
  ).resolves.toEqual({value: 'ok'});
  two.close();
});

it('cleans up a scope whose render callback throws synchronously', async () => {
  let reject!: (error: unknown) => void;
  const native = new Promise<string>((_resolve, no) => {
    reject = no;
  });
  const error = new Error('render');
  expect(() =>
    runWithServerPreloads({}, () => {
      preload(() => native, []);
      throw error;
    }),
  ).toThrow(error);
  reject(new Error('late native rejection'));
  await new Promise(resolve => setImmediate(resolve));
});
