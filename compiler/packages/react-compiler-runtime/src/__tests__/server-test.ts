/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {AsyncLocalStorage, AsyncResource} from 'node:async_hooks';
import {
  ServerPreloadScheduler,
  PreloadCancelled,
  PreloadEvent,
} from '../ServerPreloadScheduler';

function deferred<T = string>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {promise, resolve, reject};
}
const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

it('shares a task and its rejection between speculative and demand readers', async () => {
  const scheduler = new ServerPreloadScheduler();
  const value = deferred();
  const read = jest.fn(() => value.promise);
  scheduler.preload(read, ['id']);
  const first = scheduler.read(read, ['id'], false);
  const second = scheduler.read(read, ['id'], false);
  expect(first).toBe(second);
  expect(read).toHaveBeenCalledTimes(1);
  const error = new Error('failed');
  value.reject(error);
  await tick();
  await expect(first).rejects.toBe(error);
});

it('bounds concurrency and promotes a demanded task before queued speculation', async () => {
  const scheduler = new ServerPreloadScheduler({maxConcurrent: 1});
  const trace: Array<string> = [];
  const values = new Map<string, ReturnType<typeof deferred<string>>>();
  const read = (id: string): Promise<string> => {
    trace.push(id);
    const result = deferred();
    values.set(id, result);
    return result.promise;
  };
  scheduler.preload(read, ['one']);
  scheduler.preload(read, ['two']);
  scheduler.preload(read, ['three']);
  const demanded = scheduler.read(read, ['three'], false);
  expect(trace).toEqual(['one']);
  values.get('one')!.resolve('one');
  await tick();
  expect(trace).toEqual(['one', 'three']);
  values.get('three')!.resolve('three');
  await expect(demanded).resolves.toEqual({value: 'three'});
  await tick();
  expect(trace).toEqual(['one', 'three', 'two']);
  values.get('two')!.resolve('two');
});

it('does not poison the demand cache when speculative queue capacity is exhausted', async () => {
  const events: Array<PreloadEvent> = [];
  const scheduler = new ServerPreloadScheduler({
    maxConcurrent: 1,
    maxQueued: 0,
    onEvent: event => events.push(event),
  });
  const first = deferred();
  const read = jest.fn((id: string) =>
    id === 'first' ? first.promise : Promise.resolve(id),
  );
  scheduler.preload(read, ['first']);
  scheduler.preload(read, ['dropped']);
  const demand = scheduler.read(read, ['dropped'], false);
  first.resolve('first');
  await expect(demand).resolves.toEqual({value: 'dropped'});
  expect(events.some(event => event.kind === 'dropped')).toBe(true);
  expect(read).toHaveBeenCalledTimes(2);
});

it('restores the context captured at enqueue time rather than the draining context', async () => {
  const context = new AsyncLocalStorage<string>();
  const scheduler = new ServerPreloadScheduler({maxConcurrent: 1}, fn =>
    AsyncResource.bind(fn),
  );
  const first = deferred();
  const trace: Array<string | undefined> = [];
  const read = (id: string): Promise<string> => {
    trace.push(context.getStore());
    return id === 'first' ? first.promise : Promise.resolve(id);
  };
  context.run('request-a', () => scheduler.preload(read, ['first']));
  context.run('request-b', () => scheduler.preload(read, ['second']));
  context.run('unrelated', () => first.resolve('first'));
  await tick();
  expect(trace).toEqual(['request-a', 'request-b']);
});

it('cancels queued work and observes running rejection without aborting shared I/O', async () => {
  const controller = new AbortController();
  const scheduler = new ServerPreloadScheduler({
    maxConcurrent: 1,
    signal: controller.signal,
  });
  const running = deferred();
  const read = jest.fn(() => running.promise);
  const first = scheduler.read(read, ['running'], false);
  const queued = scheduler.read(read, ['queued'], false);
  const reason = new Error('request ended');
  controller.abort(reason);
  await expect(first).rejects.toBe(reason);
  await expect(queued).rejects.toBe(reason);
  running.reject(new Error('underlying cancelled by its owner'));
  await tick();
  expect(read).toHaveBeenCalledTimes(1);
});

it('bounds recursive plan expansion and deduplicates recursive identities', () => {
  const scheduler = new ServerPreloadScheduler({maxPlanSteps: 5});
  let count = 0;
  const plan = (id: number): void =>
    scheduler.plan(plan, [id], () => {
      count++;
      plan(id);
      plan(id + 1);
    });
  plan(0);
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(5);
});

it('isolates requests even when resource keys and function identities match', async () => {
  const read = jest.fn(() => Promise.resolve('value'));
  const one = new ServerPreloadScheduler();
  const two = new ServerPreloadScheduler();
  await Promise.all([
    one.read(read, ['key'], false),
    two.read(read, ['key'], false),
  ]);
  expect(read).toHaveBeenCalledTimes(2);
});

it('does not let instrumentation callbacks corrupt queue ownership', async () => {
  const scheduler = new ServerPreloadScheduler({
    onEvent: () => {
      throw new Error('observer');
    },
  });
  await expect(
    scheduler.read(() => Promise.resolve('ok'), [], false),
  ).resolves.toEqual({value: 'ok'});
});

it('handles long queues of synchronous throws without recursive draining', async () => {
  const scheduler = new ServerPreloadScheduler({maxConcurrent: 1});
  const first = deferred();
  scheduler.preload(() => first.promise, []);
  const error = new Error('sync');
  const requests = Array.from({length: 5000}, (_, index) =>
    scheduler.read(
      () => {
        throw error;
      },
      [index],
      false,
    ),
  );
  first.resolve('ok');
  const results = await Promise.all(
    requests.map(promise => promise.catch(reason => reason)),
  );
  expect(results.every(value => value === error)).toBe(true);
});

it('validates budgets and primitive resource keys', () => {
  expect(() => new ServerPreloadScheduler({maxConcurrent: 0})).toThrow(
    'maxConcurrent',
  );
  const scheduler = new ServerPreloadScheduler();
  expect(() =>
    scheduler.read(() => Promise.resolve('value'), [{} as never], false),
  ).toThrow('primitive');
  scheduler.close();
  expect(scheduler.step()).toBe(false);
  expect(new PreloadCancelled().name).toBe('PreloadCancelled');
});

it('supports symbol keys without conflating distinct primitive identities', async () => {
  const scheduler = new ServerPreloadScheduler();
  const one = Symbol('same'),
    two = Symbol('same');
  const read = jest.fn(() => Promise.resolve('value'));
  await Promise.all([
    scheduler.read(read, [one], false),
    scheduler.read(read, [one], false),
    scheduler.read(read, [two], false),
  ]);
  expect(read).toHaveBeenCalledTimes(2);
});

it('reports consumed speculative work with stable labels and monotonic timings', async () => {
  const events: Array<PreloadEvent> = [];
  const scheduler = new ServerPreloadScheduler({
    onEvent: event => events.push(event),
  });
  const resource = () => Promise.resolve('value');
  const first = scheduler.read(resource, ['id'], true, 'Page:getProduct');
  await first;
  await scheduler.read(resource, ['id'], false, 'Page:getProduct');
  expect(events.some(event => event.kind === 'consumed')).toBe(true);
  expect(events.every(event => event.resource === 'Page:getProduct')).toBe(
    true,
  );
  expect(
    events.every(
      (event, index) =>
        index === 0 || event.elapsedMs >= events[index - 1].elapsedMs,
    ),
  ).toBe(true);
});

it('does not assimilate an already fulfilled resource value a second time', async () => {
  const scheduler = new ServerPreloadScheduler();
  let accesses = 0;
  const value = Object.defineProperty({}, 'then', {
    get() {
      accesses++;
      return undefined;
    },
  });
  const native = Promise.resolve(value);
  expect(accesses).toBe(1);
  const result = await scheduler.read(() => native, [], false);
  expect(result.value).toBe(value);
  expect(accesses).toBe(1);
});

it('stops before entering a resource if an observer aborts at the start boundary', async () => {
  const controller = new AbortController();
  const scheduler = new ServerPreloadScheduler({
    signal: controller.signal,
    onEvent: event => {
      if (event.kind === 'started') {
        controller.abort();
      }
    },
  });
  const resource = jest.fn(() => Promise.resolve('value'));
  await expect(scheduler.read(resource, [], false)).rejects.toBeDefined();
  expect(resource).not.toHaveBeenCalled();
});
