/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  ServerPreloadScheduler,
  createBatchedResource,
  createServerPreloadRequest,
  createRoutePreloadManifest,
  createServerPreloadTrace,
  plan,
  read,
  resolveServerPreloadFeatures,
  shouldDeferAwait,
} from '../server';
const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

it('turns render speculation off without suppressing demanded reads or batching', async () => {
  const batches: Array<Array<number>> = [];
  const resource = createBatchedResource<readonly [number], number>(
    async keys => {
      batches.push(keys.map(([id]) => id));
      return keys.map(([value]) => ({status: 'fulfilled', value}));
    },
  );
  const request = createServerPreloadRequest({features: {preloading: false}});
  try {
    request.run(() =>
      plan(async () => {
        await read(resource, [99]);
      }, []),
    );
    await tick();
    expect(batches).toEqual([]);
    await request.run(() => Promise.all([resource(1), resource(2)]));
    expect(batches).toEqual([[1, 2]]);
  } finally {
    request.close();
  }
});

it.each([true, false])(
  'switches batching to %s without changing values or deduplication',
  async batching => {
    const batches: Array<Array<number>> = [];
    const resource = createBatchedResource<readonly [number], number>(
      async keys => {
        batches.push(keys.map(([id]) => id));
        return keys.map(([value]) => ({status: 'fulfilled', value}));
      },
    );
    const request = createServerPreloadRequest({features: {batching}});
    try {
      expect(
        await request.run(() =>
          Promise.all([resource(1), resource(2), resource(1)]),
        ),
      ).toEqual([1, 2, 1]);
      expect(batches).toEqual(batching ? [[1, 2]] : [[1], [2]]);
    } finally {
      request.close();
    }
  },
);

it('starts route plans before React, shares later demand, and isolates requests', async () => {
  const calls: Array<string> = [];
  const resource = async (id: string): Promise<string> => {
    calls.push(id);
    return id;
  };
  const preload = async (id: string): Promise<void> => {
    await read(resource, [id]);
  };
  const manifest = createRoutePreloadManifest([
    {id: 'product', props: ['id'], preload},
  ]);
  expect(() => manifest.preload('product', {id: 'one'})).toThrow(
    'explicit request owner',
  );
  const one = createServerPreloadRequest({
    features: {routeManifests: true, preloading: false},
  });
  const two = createServerPreloadRequest({features: {routeManifests: true}});
  try {
    one.run(() => {
      manifest.preload('product', {id: 'one'});
      manifest.preload('product', {id: 'one'});
    });
    await tick();
    expect(calls).toEqual(['one']);
    expect(await one.run(() => read(resource, ['one']))).toEqual({
      value: 'one',
    });
    two.run(() => manifest.preload('product', {id: 'one'}));
    await tick();
    expect(calls).toEqual(['one', 'one']);
  } finally {
    one.close();
    two.close();
  }
});

it('disables route preloads without reading parameters, and rejects getters when enabled', () => {
  const preload = jest.fn();
  const manifest = createRoutePreloadManifest([
    {id: 'page', props: ['id'], preload},
  ]);
  let accessed = false;
  const params = Object.defineProperty({}, 'id', {
    get() {
      accessed = true;
      return 'id';
    },
  });
  const off = createServerPreloadRequest();
  const on = createServerPreloadRequest({features: {routeManifests: true}});
  try {
    expect(off.run(() => manifest.preload('page', params))).toBe(false);
    expect(() => on.run(() => manifest.preload('page', params))).toThrow(
      'getters',
    );
    expect(accessed).toBe(false);
    expect(preload).not.toHaveBeenCalled();
  } finally {
    off.close();
    on.close();
  }
});

it('turns lens events and deferred consumption on and off independently', async () => {
  const trace = createServerPreloadTrace();
  const request = createServerPreloadRequest({
    features: {lens: false, deferAwait: true},
    onEvent: trace.onEvent,
  });
  try {
    expect(request.run(shouldDeferAwait)).toBe(true);
    await request.run(() => read(async () => 'value', []));
    expect(trace.snapshot().events).toEqual([]);
  } finally {
    request.close();
  }
  const off = createServerPreloadRequest();
  expect(off.run(shouldDeferAwait)).toBe(false);
  off.close();
  expect(() =>
    resolveServerPreloadFeatures(JSON.parse('{"constructor":false}')),
  ).toThrow('Invalid');
});

it.each([true, false])(
  'uses the critical-path feature flag %s to control queued speculation',
  async criticalPath => {
    const scheduler = new ServerPreloadScheduler({
      maxConcurrent: 1,
      features: {criticalPath},
    });
    let release!: () => void;
    scheduler.preload(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        }),
      [],
    );
    const order: Array<string> = [];
    const resource = async (id: string): Promise<string> => {
      order.push(id);
      return id;
    };
    const first = scheduler.read(resource, ['short'], true, 'short');
    const second = scheduler.read(resource, ['deep'], true, 'deep', {
      criticalPath: ['deep', 'child', 'leaf'],
    });
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(criticalPath ? ['deep', 'short'] : ['short', 'deep']);
  },
);

it('does not consult duration profiling when critical-path scheduling is disabled', async () => {
  const estimateDurationMs = jest.fn(() => 100);
  const scheduler = new ServerPreloadScheduler({
    features: {criticalPath: false},
    estimateDurationMs,
  });
  await scheduler.read(async () => 'value', [], false);
  expect(estimateDurationMs).not.toHaveBeenCalled();
});
