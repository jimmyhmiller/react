/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {AsyncLocalStorage} from 'node:async_hooks';
import {
  createBatchedResource,
  createServerRead,
  createServerPreloadRequest,
  createServerPreloadTrace,
  read,
  ServerPreloadScheduler,
} from '../server';
import type {BatchResult, PreloadEvent} from '../server';

const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {promise, resolve, reject};
}

it('batches twenty distinct keys into one operation at concurrency one and shares direct/compiled reads', async () => {
  const events: Array<PreloadEvent> = [];
  const load = jest.fn(async (keys: ReadonlyArray<readonly [number]>) =>
    keys.map(([id]) => ({status: 'fulfilled' as const, value: 'user' + id})),
  );
  const user = createBatchedResource(load);
  const request = createServerPreloadRequest({
    maxConcurrent: 1,
    onEvent: event => events.push(event),
  });
  try {
    await request.run(async () => {
      const results = Array.from({length: 20}, (_, id) => read(user, [id]));
      const direct = user(2);
      expect(user(2)).toBe(direct);
      expect(load).not.toHaveBeenCalled();
      expect(await direct).toBe('user2');
      expect((await Promise.all(results)).map(result => result.value)).toEqual(
        Array.from({length: 20}, (_, id) => 'user' + id),
      );
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0]).toHaveLength(20);
    expect(
      new Set(
        events
          .filter(event => event.kind === 'started')
          .map(event => event.operationId),
      ).size,
    ).toBe(1);
    expect(Math.max(...events.map(event => event.active))).toBe(1);
    expect(
      events
        .filter(event => event.kind === 'started')
        .every(event => event.batchSize === 20),
    ).toBe(true);
  } finally {
    request.close();
  }
});

it('splits bounded batches and counts active batches rather than individual keys', async () => {
  const pending: Array<
    ReturnType<typeof deferred<ReadonlyArray<BatchResult<number>>>>
  > = [];
  const sizes: Array<number> = [];
  const resource = createBatchedResource<[number], number>(
    keys => {
      sizes.push(keys.length);
      const result = deferred<ReadonlyArray<BatchResult<number>>>();
      pending.push(result);
      return result.promise;
    },
    {maxBatchSize: 3},
  );
  const request = createServerPreloadRequest({maxConcurrent: 2});
  try {
    const all = request.run(() =>
      Promise.all(Array.from({length: 8}, (_, id) => resource(id))),
    );
    await tick();
    expect(sizes).toEqual([3, 3]);
    pending[0].resolve([0, 1, 2].map(value => ({status: 'fulfilled', value})));
    await tick();
    expect(sizes).toEqual([3, 3, 2]);
    pending[1].resolve([3, 4, 5].map(value => ({status: 'fulfilled', value})));
    pending[2].resolve([6, 7].map(value => ({status: 'fulfilled', value})));
    expect(await all).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  } finally {
    request.close();
  }
});

it('delivers individual failures to their own consumers and caches their identity', async () => {
  const error = new Error('missing');
  const load = jest.fn(async (keys: ReadonlyArray<readonly [string]>) =>
    keys.map(([key]) =>
      key === 'bad'
        ? {status: 'rejected' as const, reason: error}
        : {status: 'fulfilled' as const, value: key},
    ),
  );
  const resource = createBatchedResource(load);
  const request = createServerPreloadRequest();
  try {
    await request.run(async () => {
      const bad = resource('bad');
      bad.catch(() => {});
      const good = resource('good');
      await expect(good).resolves.toBe('good');
      await expect(bad).rejects.toBe(error);
      expect(resource('bad')).toBe(bad);
    });
    expect(load).toHaveBeenCalledTimes(1);
  } finally {
    request.close();
  }
});

it.each(['throw', 'reject', 'wrong-length'])(
  'observes a %s batch failure and rejects all its keys',
  async mode => {
    const error = new Error('batch failed');
    const resource = createBatchedResource<[number], number>(() => {
      if (mode === 'throw') {
        throw error;
      }
      return mode === 'reject' ? Promise.reject(error) : Promise.resolve([]);
    });
    const request = createServerPreloadRequest();
    try {
      const values = await request.run(() =>
        Promise.all([
          resource(1).catch(error => error),
          resource(2).catch(error => error),
        ]),
      );
      expect(values[0]).toBe(values[1]);
      if (mode !== 'wrong-length') {
        expect(values[0]).toBe(error);
      } else {
        expect(values[0].message).toContain('one fulfilled/rejected result');
      }
    } finally {
      request.close();
    }
  },
);

it('cancels a pending batch before dispatch and leaves other requests isolated', async () => {
  const load = jest.fn(async (keys: ReadonlyArray<readonly [string]>) =>
    keys.map(([value]) => ({status: 'fulfilled' as const, value})),
  );
  const resource = createBatchedResource(load);
  const one = createServerPreloadRequest(),
    two = createServerPreloadRequest();
  const first = one.run(() => resource('id'));
  first.catch(() => {});
  one.close('ended');
  await expect(first).rejects.toBe('ended');
  await expect(two.run(() => resource('id'))).resolves.toBe('id');
  expect(load).toHaveBeenCalledTimes(1);
  two.close();
});

it('captures request context for bulk callbacks and never shares results across requests', async () => {
  const context = new AsyncLocalStorage<string>();
  const contexts: Array<string | undefined> = [];
  const resource = createBatchedResource<[string], string>(async keys => {
    contexts.push(context.getStore());
    return keys.map(([id]) => ({
      status: 'fulfilled',
      value: context.getStore() + ':' + id,
    }));
  });
  const one = createServerPreloadRequest(),
    two = createServerPreloadRequest();
  try {
    const a = context.run('a', () => one.run(() => resource('same')));
    const b = context.run('b', () => two.run(() => resource('same')));
    expect(await Promise.all([a, b])).toEqual(['a:same', 'b:same']);
    expect(contexts).toEqual(['a', 'b']);
  } finally {
    one.close();
    two.close();
  }
});

it('does not poison later demand when the speculative batch queue overflows', async () => {
  const resource = createBatchedResource<[number], number>(async keys =>
    keys.map(([value]) => ({status: 'fulfilled', value})),
  );
  const scheduler = new ServerPreloadScheduler({maxQueued: 1});
  const first = scheduler.read(resource, [1], true);
  const dropped = scheduler.read(resource, [2], true);
  await expect(dropped).rejects.toBeDefined();
  await expect(first).resolves.toEqual({value: 1});
  await expect(scheduler.read(resource, [2], false)).resolves.toEqual({
    value: 2,
  });
});

it.each(['critical-path', 'fifo'] as const)(
  'selects queued speculative work using %s with stable ties',
  async scheduling => {
    const scheduler = new ServerPreloadScheduler({
      maxConcurrent: 1,
      scheduling,
    });
    const blocker = deferred<string>();
    scheduler.preload(() => blocker.promise, []);
    const trace: Array<string> = [];
    const resource = (key: string): Promise<string> => {
      trace.push(key);
      return Promise.resolve(key);
    };
    scheduler.read(resource, ['short'], true, 'short', {
      criticalPath: ['short'],
    });
    scheduler.read(resource, ['long'], true, 'long', {
      criticalPath: ['long', 'child', 'grandchild'],
    });
    blocker.resolve('done');
    await tick();
    expect(trace).toEqual(
      scheduling === 'critical-path' ? ['long', 'short'] : ['short', 'long'],
    );
  },
);

it('keeps demand ahead of a critical speculative path and uses supplied cost estimates', async () => {
  const scheduler = new ServerPreloadScheduler({
    maxConcurrent: 1,
    estimateDurationMs: label => (label === 'expensive' ? 100 : 1),
  });
  const blocker = deferred<string>();
  scheduler.preload(() => blocker.promise, []);
  const trace: Array<string> = [];
  const resource = (key: string): Promise<string> => {
    trace.push(key);
    return Promise.resolve(key);
  };
  scheduler.read(resource, ['deep'], true, 'deep', {
    criticalPath: ['deep', 'child'],
  });
  scheduler.read(resource, ['expensive'], true, 'expensive');
  scheduler.read(resource, ['demand'], false, 'demand');
  blocker.resolve('done');
  await tick();
  expect(trace).toEqual(['demand', 'expensive', 'deep']);
});

it('records a bounded trace without retaining resource arguments or sharing mutable snapshots', async () => {
  const trace = createServerPreloadTrace({maxEvents: 2});
  const scheduler = new ServerPreloadScheduler({onEvent: trace.onEvent});
  await scheduler.read(
    () => Promise.resolve('secret result'),
    ['secret key'],
    true,
    'Page:read',
  );
  await scheduler.read(() => Promise.resolve('other'), [], true, 'Page:other');
  const snapshot = trace.snapshot();
  expect(snapshot.events).toHaveLength(2);
  expect(snapshot.droppedEvents).toBeGreaterThan(0);
  expect(JSON.stringify(snapshot)).not.toContain('secret');
  snapshot.events[0].resource = 'changed';
  expect(trace.snapshot().events[0].resource).toBe('Page:read');
  expect(() => createServerPreloadTrace({maxEvents: -1})).toThrow('maxEvents');
  expect(() =>
    createBatchedResource(async () => [], {maxBatchSize: 0}),
  ).toThrow('maxBatchSize');
});

it.each(['sparse', 'throwing-result'])(
  'rejects malformed %s results without hanging keys or leaving unobserved failures',
  async mode => {
    const resource = createBatchedResource<[number], number>(async keys =>
      mode === 'sparse'
        ? new Array(keys.length)
        : (keys.map(() =>
            Object.defineProperty({}, 'status', {
              get() {
                throw new Error('bad result');
              },
            }),
          ) as never),
    );
    const request = createServerPreloadRequest();
    try {
      const results = await request.run(() =>
        Promise.all([
          resource(1).catch(error => error),
          resource(2).catch(error => error),
        ]),
      );
      expect(results[0]).toBeInstanceOf(Error);
      expect(results[0]).toBe(results[1]);
    } finally {
      request.close();
    }
  },
);

it('cancels running batch observers and does not invoke queued batches after the request closes', async () => {
  const pending = deferred<ReadonlyArray<BatchResult<number>>>();
  const load = jest.fn(() => pending.promise);
  const resource = createBatchedResource<[number], number>(load, {
    maxBatchSize: 1,
  });
  const request = createServerPreloadRequest({maxConcurrent: 1});
  const results = request.run(() => [resource(1), resource(2)]);
  results.forEach(result => result.catch(() => {}));
  await tick();
  expect(load).toHaveBeenCalledTimes(1);
  request.close('ended');
  await Promise.all(
    results.map(result => expect(result).rejects.toBe('ended')),
  );
  pending.reject(new Error('late backend failure'));
  await tick();
  expect(load).toHaveBeenCalledTimes(1);
});

it('does not enter bulk I/O when the request is aborted by its start observer', async () => {
  const controller = new AbortController();
  const load = jest.fn(async (keys: ReadonlyArray<readonly [number]>) =>
    keys.map(([value]) => ({status: 'fulfilled' as const, value})),
  );
  const resource = createBatchedResource(load);
  const request = createServerPreloadRequest({
    signal: controller.signal,
    onEvent: event => {
      if (event.kind === 'started') {
        controller.abort('ended');
      }
    },
  });
  const promises = request.run(() => [resource(1), resource(2)]);
  await Promise.all(
    promises.map(promise => expect(promise).rejects.toBe('ended')),
  );
  expect(load).not.toHaveBeenCalled();
  request.close();
});

it('preserves FIFO among demanded reads and ignores invalid profiling estimates', async () => {
  const scheduler = new ServerPreloadScheduler({
    maxConcurrent: 1,
    estimateDurationMs: label => {
      if (label === 'invalid') {
        return NaN;
      }
      throw new Error('no profile');
    },
  });
  const blocker = deferred<string>();
  scheduler.preload(() => blocker.promise, []);
  const trace: Array<string> = [];
  const resource = (key: string): Promise<string> => {
    trace.push(key);
    return Promise.resolve(key);
  };
  const first = scheduler.read(resource, ['first'], false, 'invalid');
  const second = scheduler.read(resource, ['second'], false, 'second', {
    criticalPath: ['second', 'child'],
  });
  blocker.resolve('done');
  await Promise.all([first, second]);
  expect(trace).toEqual(['first', 'second']);
});

it('creates a single-read resource with preload/direct/compiler cache identity and isolated requests', async () => {
  const pending = deferred<string>();
  const load = jest.fn((_id: string) => pending.promise);
  const resource = createServerRead(load);
  const owner = createServerPreloadRequest({maxConcurrent: 1});
  try {
    await owner.run(async () => {
      resource.preload('a');
      await tick();
      expect(load).toHaveBeenCalledTimes(1);
      const direct = resource('a');
      expect(resource('a')).toBe(direct);
      const compiled = read(resource, ['a']);
      pending.resolve('value');
      expect(await direct).toBe('value');
      expect((await compiled).value).toBe('value');
      expect(load).toHaveBeenCalledTimes(1);
    });
  } finally {
    owner.close();
  }
  const next = createServerPreloadRequest();
  try {
    await next.run(() => resource('a'));
  } finally {
    next.close();
  }
  expect(load).toHaveBeenCalledTimes(2);
});

it('preserves synchronous and asynchronous single-read errors and observes unused preloads', async () => {
  const error = new Error('original');
  for (const load of [
    () => {
      throw error;
    },
    () => Promise.reject(error),
  ]) {
    const resource = createServerRead<readonly [string], never>(load);
    const owner = createServerPreloadRequest();
    try {
      await owner.run(async () => {
        resource.preload('unused');
        await tick();
        const result = resource('used');
        expect(resource('used')).toBe(result);
        await expect(result).rejects.toBe(error);
        await expect(read(resource, ['used'])).rejects.toBe(error);
      });
    } finally {
      owner.close();
    }
  }
});

it('disables manual single-read speculation without disabling demanded reads', async () => {
  const load = jest.fn(async (id: string) => id);
  const resource = createServerRead(load);
  const owner = createServerPreloadRequest({features: {preloading: false}});
  try {
    await owner.run(async () => {
      resource.preload('a');
      await tick();
      expect(load).not.toHaveBeenCalled();
      expect(await resource('a')).toBe('a');
      expect(load).toHaveBeenCalledTimes(1);
    });
  } finally {
    owner.close();
  }
});

it.each([true, false])(
  'unifies single and bulk loaders with batching=%s, bounded dispatch and shared cache',
  async batching => {
    const single = jest.fn(
      async (tenant: string, id: number) => `${tenant}:${id}`,
    );
    const bulk = jest.fn(
      async (keys: ReadonlyArray<readonly [string, number]>) => {
        expect(Object.isFrozen(keys)).toBe(true);
        expect(keys.every(Object.isFrozen)).toBe(true);
        return keys.map(([tenant, id]) => ({
          status: 'fulfilled' as const,
          value: `${tenant}:${id}`,
        }));
      },
    );
    const resource = createServerRead(single, {batch: bulk, maxBatchSize: 3});
    const trace = createServerPreloadTrace();
    const owner = createServerPreloadRequest({
      maxConcurrent: 1,
      features: {batching},
      onEvent: trace.onEvent,
    });
    try {
      await owner.run(async () => {
        for (let id = 0; id < 7; id++) resource.preload('tenant', id);
        const tasks = Array.from({length: 7}, (_, id) =>
          read(resource, ['tenant', id]),
        );
        const direct = resource('tenant', 2);
        expect(resource('tenant', 2)).toBe(direct);
        expect(await direct).toBe('tenant:2');
        expect((await Promise.all(tasks)).map(value => value.value)).toEqual(
          Array.from({length: 7}, (_, id) => `tenant:${id}`),
        );
      });
      expect(single).toHaveBeenCalledTimes(batching ? 0 : 7);
      expect(bulk.mock.calls.map(([keys]) => keys.length)).toEqual(
        batching ? [3, 3, 1] : [],
      );
      const events = trace.snapshot().events;
      expect(
        new Set(
          events
            .filter(event => event.kind === 'started')
            .map(event => event.operationId),
        ).size,
      ).toBe(batching ? 3 : 7);
      expect(events.every(event => event.active <= 1)).toBe(true);
    } finally {
      owner.close();
    }
  },
);

it('preserves bulk per-key errors and observes unconsumed rejected keys', async () => {
  const error = new Error('per key');
  const single = jest.fn(async (id: number) => id);
  const resource = createServerRead(single, {
    async batch(keys) {
      return keys.map(([id]) =>
        id === 1
          ? {status: 'fulfilled' as const, value: id}
          : {status: 'rejected' as const, reason: error},
      );
    },
  });
  const owner = createServerPreloadRequest();
  try {
    await owner.run(async () => {
      resource.preload(0);
      resource.preload(1);
      resource.preload(2);
      await tick();
      await expect(resource(0)).rejects.toBe(error);
      expect(await resource(1)).toBe(1);
      await expect(read(resource, [0])).rejects.toBe(error);
      expect(single).not.toHaveBeenCalled();
    });
  } finally {
    owner.close();
  }
});

it.each(['throw', 'reject', 'sparse', 'length', 'status'])(
  'surfaces malformed or failed unified batches at original consumers: %s',
  async mode => {
    const error = new Error('batch failure');
    const resource = createServerRead(async (id: number) => id, {
      batch: (() => {
        if (mode === 'throw') throw error;
        if (mode === 'reject') return Promise.reject(error);
        return Promise.resolve(
          mode === 'sparse'
            ? new Array(2)
            : mode === 'length'
              ? []
              : [{status: 'bad'}, {status: 'bad'}],
        );
      }) as any,
    });
    const owner = createServerPreloadRequest();
    try {
      await owner.run(async () => {
        resource.preload(1);
        resource.preload(2);
        await tick();
        const first = resource(1);
        const second = resource(2);
        if (mode === 'throw' || mode === 'reject') {
          await expect(first).rejects.toBe(error);
          await expect(second).rejects.toBe(error);
        } else {
          await expect(first).rejects.toThrow(
            'one fulfilled/rejected result per key',
          );
          await expect(second).rejects.toThrow(
            'one fulfilled/rejected result per key',
          );
        }
      });
    } finally {
      owner.close();
    }
  },
);

it('validates and captures unified batch definitions', async () => {
  expect(() => createServerRead(async () => 1, {maxBatchSize: 2})).toThrow(
    'requires',
  );
  expect(() => createServerRead(async () => 1, {batch: 1 as any})).toThrow(
    'function',
  );
  expect(() =>
    createServerRead(async () => 1, {batch: async () => [], maxBatchSize: 0}),
  ).toThrow('positive safe integer');
  const options = {
    batch: jest.fn(async (keys: ReadonlyArray<readonly [number]>) =>
      keys.map(([id]) => ({status: 'fulfilled' as const, value: id})),
    ),
  };
  const original = options.batch;
  const resource = createServerRead(async (id: number) => id, options);
  options.batch = jest.fn(async (_keys: ReadonlyArray<readonly [number]>) => {
    throw new Error('replaced');
  });
  const owner = createServerPreloadRequest();
  try {
    expect(await owner.run(() => resource(1))).toBe(1);
  } finally {
    owner.close();
  }
  expect(original).toHaveBeenCalledTimes(1);
  expect(options.batch).not.toHaveBeenCalled();
});

it('isolates simultaneous unified reads and their batching profiles by request', async () => {
  const context = new AsyncLocalStorage<string>();
  const single = jest.fn(async (id: number) => `${context.getStore()}:${id}`);
  const batch = jest.fn(async (keys: ReadonlyArray<readonly [number]>) =>
    keys.map(([id]) => ({
      status: 'fulfilled' as const,
      value: `${context.getStore()}:${id}`,
    })),
  );
  const resource = createServerRead(single, {batch});
  const owners = [
    createServerPreloadRequest({features: {batching: true}}),
    createServerPreloadRequest({features: {batching: false}}),
  ];
  try {
    const values = await Promise.all(
      owners.map((owner, index) =>
        context.run(String(index), () =>
          owner.run(async () => {
            const first = resource(1);
            const second = resource(2);
            return Promise.all([first, second]);
          }),
        ),
      ),
    );
    expect(values).toEqual([
      ['0:1', '0:2'],
      ['1:1', '1:2'],
    ]);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(single).toHaveBeenCalledTimes(2);
  } finally {
    owners.forEach(owner => owner.close());
  }
});

it('does not start queued unified batches after cancellation or poison demand after a speculation drop', async () => {
  const single = jest.fn(async (id: number) => id);
  const batch = jest.fn(async (keys: ReadonlyArray<readonly [number]>) =>
    keys.map(([id]) => ({status: 'fulfilled' as const, value: id})),
  );
  const resource = createServerRead(single, {batch});
  const error = new Error('aborted');
  const cancelled = createServerPreloadRequest();
  const pending = cancelled.run(() => resource(1));
  cancelled.close(error);
  await expect(pending).rejects.toBe(error);
  await tick();
  expect(batch).not.toHaveBeenCalled();
  const next = createServerPreloadRequest({maxQueued: 0});
  try {
    await next.run(async () => {
      resource.preload(1);
      await tick();
      expect(batch).not.toHaveBeenCalled();
      expect(await resource(1)).toBe(1);
    });
  } finally {
    next.close();
  }
  expect(batch).toHaveBeenCalledTimes(1);
});

it.each(['single', 'batch', 'preload'])(
  'rejects nested same-pool backend reads instead of deadlocking at concurrency one: %s',
  async mode => {
    const inner = createServerRead(async (id: number) => id);
    const resource = createServerRead(
      async (id: number) => {
        await Promise.resolve();
        if (mode === 'preload') {
          inner.preload(id);
          return id;
        }
        return inner(id);
      },
      mode === 'batch'
        ? {
            async batch(keys) {
              await Promise.resolve();
              return Promise.all(
                keys.map(async ([id]) => ({
                  status: 'fulfilled' as const,
                  value: await inner(id),
                })),
              );
            },
          }
        : {},
    );
    const owner = createServerPreloadRequest({maxConcurrent: 1});
    try {
      await expect(owner.run(() => resource(1))).rejects.toThrow(
        'must perform native I/O',
      );
    } finally {
      owner.close();
    }
  },
);
