/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {AsyncLocalStorage, AsyncResource} from 'node:async_hooks';
import * as React from 'react';
import {registerBatch, BatchOptions, BatchResult} from './ServerPreloadBatch';
export type {BatchOptions, BatchResult} from './ServerPreloadBatch';
export {
  defaultServerPreloadFeatures,
  resolveServerPreloadFeatures,
} from './ServerPreloadFeatures';
export type {ServerPreloadFeatures} from './ServerPreloadFeatures';
import {
  ServerPreloadScheduler,
  PreloadSchedulerOptions,
  PreloadKey,
  PreloadCancelled,
  PreloadResult,
  PreloadSchedulingHint,
} from './ServerPreloadScheduler';
export {
  ServerPreloadScheduler,
  PreloadCancelled,
} from './ServerPreloadScheduler';
export type {
  PreloadSchedulerOptions,
  PreloadEvent,
  PreloadKey,
  PreloadResult,
  PreloadSchedulingHint,
} from './ServerPreloadScheduler';

/*
 * This package also supports older React clients, whose type definitions do not
 * contain the server cache APIs. This separate entrypoint requires React 19 RSC.
 */
const serverReact = React as unknown as {
  cache: <T extends (...args: Array<any>) => any>(fn: T) => T;
  cacheSignal?: () => AbortSignal | null;
};
const requests = new AsyncLocalStorage<ServerPreloadScheduler>();
const backendReads = new AsyncLocalStorage<ServerPreloadScheduler>();
const speculative = new AsyncLocalStorage<'render' | 'route'>();
const bind = <T extends (...args: Array<any>) => any>(fn: T): T =>
  AsyncResource.bind(fn);
const defaultRequest = serverReact.cache(
  () => new ServerPreloadScheduler({signal: serverReact.cacheSignal?.()}, bind),
);

function scheduler(): ServerPreloadScheduler {
  return requests.getStore() ?? defaultRequest();
}

/** Bind this to the renderer request lifetime when overriding queue budgets. */
export function runWithServerPreloads<T>(
  options: PreloadSchedulerOptions,
  render: () => T,
): T {
  const request = new ServerPreloadScheduler(options, bind);
  try {
    return requests.run(request, render);
  } catch (error) {
    request.close(error);
    throw error;
  }
}

export function read<T>(
  fn: (...args: Array<any>) => Promise<T>,
  args: Array<PreloadKey>,
  label?: string,
  hint?: PreloadSchedulingHint,
): Promise<PreloadResult<T>> {
  const request = scheduler();
  assertNativeRead(request);
  return request.read(
    fn,
    args,
    speculative.getStore() !== undefined,
    label,
    hint,
    speculative.getStore() ?? 'render',
  );
}

export function preload(
  fn: (...args: Array<any>) => Promise<any>,
  args: Array<PreloadKey>,
): void {
  const request = scheduler();
  assertNativeRead(request);
  request.preload(fn, args);
}

function assertNativeRead(request: ServerPreloadScheduler): void {
  if (backendReads.getStore() === request) {
    throw new Error(
      'Server read callbacks must perform native I/O, not await or preload another read on the same request scheduler',
    );
  }
}

export function plan(
  fn: (...args: Array<any>) => unknown,
  args: Array<unknown>,
): void {
  runPlan(fn, args, speculative.getStore() ?? 'render');
}
function runPlan(
  fn: (...args: Array<any>) => unknown,
  args: Array<unknown>,
  origin: 'render' | 'route',
): void {
  const request = scheduler();
  request.plan(
    fn,
    args,
    () => {
      requests.run(request, () =>
        speculative.run(origin, () => {
          try {
            const result = fn(...args);
            if (
              result != null &&
              typeof (result as Promise<unknown>).then === 'function'
            ) {
              (result as Promise<unknown>).then(undefined, () => {});
            }
          } catch {
            /* Original consumers surface speculative failures. */
          }
        }),
      );
    },
    origin,
  );
}

export function step(): boolean {
  return scheduler().step();
}

/** An inline extracted segment can capture immutable data without keying a plan. */
export function launch(fn: () => unknown): void {
  const request = scheduler();
  const origin = speculative.getStore() ?? 'render';
  if (
    !(origin === 'route'
      ? request.features.routeManifests
      : request.features.preloading) ||
    !request.step()
  ) {
    return;
  }
  requests.run(request, () =>
    speculative.run(origin, () => {
      try {
        const result = fn();
        if (
          result != null &&
          typeof (result as Promise<unknown>).then === 'function'
        ) {
          (result as Promise<unknown>).then(undefined, () => {});
        }
      } catch {
        // Only the original consumer surfaces a speculative plan failure.
      }
    }),
  );
}

/** All generated forks run in an already captured plan/request context. */
export function fork<T>(fn: () => Promise<T>): Promise<T> {
  const promise = fn();
  promise.catch(() => {});
  return promise;
}

export async function each<T>(
  values: ReadonlyArray<T>,
  fn: (value: T) => Promise<unknown>,
): Promise<void> {
  const tasks: Array<Promise<unknown>> = [];
  // Inputs are compiler-proven native immutable arrays, never custom iterators.
  for (let index = 0; index < values.length; index++) {
    if (!step()) {
      throw new PreloadCancelled();
    }
    const task = fn(values[index]);
    task.catch(() => {});
    tasks.push(task);
  }
  /*
   * All iterations have rejection observers, while consumption remains in
   * source order so a copied catch sees the same first iteration failure.
   */
  for (const task of tasks) {
    await task;
  }
}

export function isCancelled(error: unknown): boolean {
  return scheduler().isCancelled(error);
}

/** Explicit ownership for streaming hosts whose render callback returns early. */
export function createServerPreloadRequest(
  options: PreloadSchedulerOptions = {},
): {
  signal: AbortSignal;
  run: <T>(render: () => T) => T;
  close: (reason?: unknown) => void;
} {
  const controller = new AbortController();
  const request = new ServerPreloadScheduler(
    {...options, signal: controller.signal},
    bind,
  );
  const parent = options.signal;
  const abort = (): void => controller.abort(parent?.reason);
  if (parent?.aborted) {
    abort();
  } else if (parent != null) {
    parent.addEventListener('abort', abort, {once: true});
    controller.signal.addEventListener(
      'abort',
      () => parent.removeEventListener('abort', abort),
      {once: true},
    );
  }
  return {
    signal: controller.signal,
    run<T>(render: () => T): T {
      try {
        return requests.run(request, render);
      } catch (error) {
        controller.abort(error);
        throw error;
      }
    },
    close(reason?: unknown): void {
      controller.abort(reason);
    },
  };
}

/** Resource implementations can opt into their request owner's abort signal. */
export function getServerPreloadSignal(): AbortSignal | null {
  return scheduler().signal;
}

/**
 * A render-safe async read. Defining one permits speculative execution, including
 * work whose original consumer is never reached. No mutations or authorization
 * transitions may be hidden in load; use primitive keys and request-stable context.
 */
type ServerReadResultOptions = {
  result?: 'unknown' | 'primitive' | 'immutable-data' | 'array';
};
export type ServerReadOptions<
  Args extends ReadonlyArray<PreloadKey> = ReadonlyArray<PreloadKey>,
  T = unknown,
> = ServerReadResultOptions &
  BatchOptions & {
    /** Equivalent per-key outcomes, in input order. Runs only when batching is enabled. */
    batch?: (
      keys: ReadonlyArray<Args>,
    ) => Promise<ReadonlyArray<BatchResult<T>>>;
  };
export type ServerRead<Args extends ReadonlyArray<PreloadKey>, T> = {
  (...args: Args): Promise<T>;
  preload(...args: Args): void;
};
export function createServerRead<Args extends ReadonlyArray<PreloadKey>, T>(
  load: (...args: Args) => Promise<T>,
  options: ServerReadOptions<Args, T> = {},
): ServerRead<Args, T> {
  validateReadOptions(options);
  /*
   * Capture the definition once; later mutation of the caller's options cannot
   * change the contract of an already-created resource.
   */
  const batch = options.batch;
  if (batch !== undefined && typeof batch !== 'function') {
    throw new Error('A server read batch must be a function');
  }
  if (batch === undefined && options.maxBatchSize !== undefined) {
    throw new Error('maxBatchSize requires a server read batch callback');
  }
  const resource = createBatchedResource<Args, T>(
    async keys => {
      if (batch !== undefined && scheduler().features.batching) {
        return batch(keys);
      }
      return Promise.all(
        keys.map(async args => {
          try {
            return {status: 'fulfilled' as const, value: await load(...args)};
          } catch (reason) {
            return {status: 'rejected' as const, reason};
          }
        }),
      );
    },
    {maxBatchSize: batch === undefined ? 1 : (options.maxBatchSize ?? 100)},
  );
  return Object.assign(resource, {
    preload(...args: Args): void {
      preload(resource, [...args]);
    },
  });
}

function validateReadOptions(options: ServerReadResultOptions): void {
  if (
    options.result !== undefined &&
    !['unknown', 'primitive', 'immutable-data', 'array'].includes(
      options.result,
    )
  ) {
    throw new Error('Invalid server read result contract');
  }
}

/** Define a stable module-level, request-cached bulk resource with primitive key tuples. */
export function createBatchedResource<
  Args extends ReadonlyArray<PreloadKey>,
  T,
>(
  load: (keys: ReadonlyArray<Args>) => Promise<ReadonlyArray<BatchResult<T>>>,
  options: BatchOptions & ServerReadResultOptions = {},
): (...args: Args) => Promise<T> {
  validateReadOptions(options);
  const promises = new WeakMap<Promise<PreloadResult<T>>, Promise<T>>();
  const resource = (...args: Args): Promise<T> => {
    const task = read(resource, [...args]);
    let result = promises.get(task);
    if (result === undefined) {
      result = task.then(envelope => envelope.value);
      promises.set(task, result);
    }
    return result;
  };
  registerBatch(
    resource,
    keys => backendReads.run(scheduler(), () => load(keys)),
    options,
  );
  return resource;
}

export {createServerPreloadTrace} from './ServerPreloadTrace';
export type {ServerPreloadTrace} from './ServerPreloadTrace';

/** A separate semantic opt-in; disabled requests consume the original parent await. */
export function shouldDeferAwait(): boolean {
  return scheduler().features.deferAwait;
}

export type RoutePreloadDefinition = {
  id: string;
  props: ReadonlyArray<string>;
  preload: (...args: Array<any>) => unknown;
};
export function createRoutePreloadManifest(
  definitions: ReadonlyArray<RoutePreloadDefinition>,
): {
  routes: ReadonlyArray<{id: string; props: ReadonlyArray<string>}>;
  preload: (
    id: string,
    parameters: Readonly<Record<string, PreloadKey>>,
  ) => boolean;
} {
  const routes = new Map<string, RoutePreloadDefinition>();
  for (const definition of definitions) {
    if (routes.has(definition.id)) {
      throw new Error(`Duplicate preload route: ${definition.id}`);
    }
    routes.set(definition.id, {
      ...definition,
      props: Object.freeze([...definition.props]),
    });
  }
  return Object.freeze({
    routes: Object.freeze(
      Array.from(routes.values(), route =>
        Object.freeze({id: route.id, props: route.props}),
      ),
    ),
    preload(
      id: string,
      parameters: Readonly<Record<string, PreloadKey>>,
    ): boolean {
      const request = requests.getStore();
      if (request === undefined) {
        throw new Error(
          'Route preloads require an explicit request owner; call manifest.preload inside request.run',
        );
      }
      if (!request.features.routeManifests || request.signal?.aborted) {
        return false;
      }
      const route = routes.get(id);
      if (route === undefined) {
        throw new Error(`Unknown preload route: ${id}`);
      }
      if (
        parameters == null ||
        (Object.getPrototypeOf(parameters) !== Object.prototype &&
          Object.getPrototypeOf(parameters) !== null)
      ) {
        throw new Error(
          'Route parameters must be a plain record of primitive data',
        );
      }
      const args = route.props.map(prop => {
        const descriptor = Object.getOwnPropertyDescriptor(parameters, prop);
        if (descriptor !== undefined && !('value' in descriptor)) {
          throw new Error('Route parameters cannot contain getters');
        }
        const value = descriptor?.value;
        if (
          (typeof value === 'object' && value !== null) ||
          typeof value === 'function'
        ) {
          throw new Error('Route parameters must be primitive values');
        }
        return value;
      });
      runPlan(route.preload, args, 'route');
      return true;
    },
  });
}
