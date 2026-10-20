/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {getBatch, BatchDefinition} from './ServerPreloadBatch';
import {
  ServerPreloadFeatures,
  resolveServerPreloadFeatures,
} from './ServerPreloadFeatures';

export type PreloadSchedulingHint = {
  /** Longest known downstream path, including this read; labels contain no keys. */
  criticalPath?: ReadonlyArray<string>;
};

export type PreloadKey =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined;
export type PreloadResult<T> = {readonly value: T};

export type PreloadEvent = {
  kind:
    | 'queued'
    | 'started'
    | 'promoted'
    | 'fulfilled'
    | 'rejected'
    | 'dropped'
    | 'cancelled'
    | 'consumed';
  taskId: number;
  operationId?: number;
  batchSize?: number;
  priority: number;
  criticalPath: ReadonlyArray<string>;
  resource: string;
  speculative: boolean;
  active: number;
  queued: number;
  elapsedMs: number;
  durationMs?: number;
};
export type PreloadSchedulerOptions = {
  features?: Partial<ServerPreloadFeatures>;
  /** Backend operations, including a complete batch as one operation. */
  maxConcurrent?: number;
  scheduling?: 'fifo' | 'critical-path';
  /** Optional historical duration estimate; invalid estimates fall back to one. */
  estimateDurationMs?: (resource: string) => number;
  maxQueued?: number;
  maxPlanSteps?: number;
  signal?: AbortSignal | null | undefined;
  onEvent?: (event: PreloadEvent) => void;
};

type PlanFunction = (...args: Array<any>) => unknown;

type Read = (...args: Array<any>) => Promise<any>;
type Operation = {id: number; remaining: number};
type Task = {
  id: number;
  priority: number;
  criticalPath: ReadonlyArray<string>;
  operation?: Operation;
  batchSize?: number;
  invokeBatch: (
    batch: BatchDefinition,
    tasks: Array<Task>,
    operation: Operation,
  ) => void;
  fn: Read;
  name: string;
  startedAt: number | null;
  args: Array<PreloadKey>;
  start: () => void;
  speculative: boolean;
  status: 'queued' | 'running' | 'fulfilled' | 'rejected';
  promise: Promise<PreloadResult<any>>;
  resolve: (value: PreloadResult<any>) => void;
  reject: (error: unknown) => void;
};
type Trie = {children: Map<unknown, Trie>; task?: Task; started?: boolean};

export class PreloadCancelled extends Error {
  constructor() {
    super('The server preload request has finished or was aborted');
    this.name = 'PreloadCancelled';
  }
}

/** Request-owned queues. Binding is injected so this core has no Node dependency. */
export class ServerPreloadScheduler {
  readonly features: Readonly<ServerPreloadFeatures>;
  readonly signal: AbortSignal | null;
  readonly #maxConcurrent: number;
  readonly #scheduling: 'fifo' | 'critical-path';
  readonly #estimateDurationMs: PreloadSchedulerOptions['estimateDurationMs'];
  readonly #maxQueued: number;
  readonly #maxPlanSteps: number;
  readonly #onEvent: PreloadSchedulerOptions['onEvent'];
  readonly #bind: <T extends (...args: Array<any>) => any>(fn: T) => T;
  readonly #startedAt = performance.now();
  readonly #tasks = new Map<Read, Trie>();
  readonly #plans = new Map<PlanFunction, Trie>();
  readonly #demand: Array<Task> = [];
  readonly #speculative: Array<Task> = [];
  readonly #running = new Set<Task>();
  #queued = 0;
  #activeOperations = 0;
  #nextTask = 1;
  #nextOperation = 1;
  #flushScheduled = false;
  #steps = 0;
  #closed = false;
  #draining = false;
  #reason: unknown = new PreloadCancelled();
  #removeAbortListener: (() => void) | null = null;

  constructor(
    options: PreloadSchedulerOptions = {},
    bind: <T extends (...args: Array<any>) => any>(fn: T) => T = <
      T extends (...args: Array<any>) => any,
    >(
      fn: T,
    ): T => fn,
  ) {
    const positive = (value: number, name: string, minimum: number): number => {
      if (!Number.isSafeInteger(value) || value < minimum) {
        throw new Error(`${name} must be a safe integer >= ${minimum}`);
      }
      return value;
    };
    this.#maxConcurrent = positive(
      options.maxConcurrent ?? 8,
      'maxConcurrent',
      1,
    );
    this.#maxQueued = positive(options.maxQueued ?? 128, 'maxQueued', 0);
    this.#maxPlanSteps = positive(
      options.maxPlanSteps ?? 1024,
      'maxPlanSteps',
      0,
    );
    this.features = resolveServerPreloadFeatures(options.features);
    this.#scheduling = this.features.criticalPath
      ? (options.scheduling ?? 'critical-path')
      : 'fifo';
    this.#estimateDurationMs = options.estimateDurationMs;
    this.#onEvent = this.features.lens ? options.onEvent : undefined;
    this.#bind = bind;
    const signal = options.signal;
    this.signal = signal ?? null;
    if (signal != null) {
      const abort = (): void =>
        this.close(signal.reason ?? new PreloadCancelled());
      if (signal.aborted) {
        abort();
      } else {
        signal.addEventListener('abort', abort, {once: true});
        this.#removeAbortListener = (): void =>
          signal.removeEventListener('abort', abort);
      }
    }
  }

  #emit(
    kind: PreloadEvent['kind'],
    task: Pick<
      Task,
      | 'id'
      | 'name'
      | 'startedAt'
      | 'speculative'
      | 'priority'
      | 'criticalPath'
      | 'operation'
      | 'batchSize'
    >,
  ): void {
    try {
      this.#onEvent?.({
        kind,
        taskId: task.id,
        ...(task.operation === undefined
          ? {}
          : {operationId: task.operation.id}),
        ...(task.batchSize === undefined ? {} : {batchSize: task.batchSize}),
        priority: task.priority,
        criticalPath: task.criticalPath,
        resource: task.name,
        speculative: task.speculative,
        active: this.#activeOperations,
        queued: this.#queued,
        elapsedMs: performance.now() - this.#startedAt,
        ...(task.startedAt === null
          ? {}
          : {durationMs: performance.now() - task.startedAt}),
      });
    } catch {
      // Observability callbacks must not alter rendering or queue ownership.
    }
  }

  #lookup(
    map: Map<PlanFunction, Trie>,
    fn: PlanFunction,
    args: Array<unknown>,
  ): Trie | undefined {
    let node: Trie | undefined = map.get(fn);
    for (const arg of args) {
      if (node === undefined) {
        return undefined;
      }
      node = node.children.get(arg);
    }
    return node;
  }

  #node(
    map: Map<PlanFunction, Trie>,
    fn: PlanFunction,
    args: Array<unknown>,
  ): Trie {
    let node = map.get(fn);
    if (node === undefined) {
      node = {children: new Map()};
      map.set(fn, node);
    }
    let cursor: Trie = node;
    for (const key of args) {
      let child: Trie | undefined = cursor.children.get(key);
      if (child === undefined) {
        child = {children: new Map()};
        cursor.children.set(key, child);
      }
      cursor = child;
    }
    return cursor;
  }

  /** Limits speculative plan expansion, including recursive plans and loops. */
  isCancelled(error: unknown): boolean {
    return this.#closed || error instanceof PreloadCancelled;
  }

  step(): boolean {
    if (this.#closed || this.#steps >= this.#maxPlanSteps) {
      return false;
    }
    this.#steps++;
    return true;
  }

  read<T>(
    fn: (...args: Array<any>) => Promise<T>,
    args: Array<PreloadKey>,
    speculative: boolean,
    label?: string,
    hint?: PreloadSchedulingHint,
    origin: 'render' | 'route' = 'render',
  ): Promise<PreloadResult<T>> {
    if (this.#closed) {
      const promise = Promise.reject<PreloadResult<T>>(this.#reason);
      promise.catch(() => {});
      return promise;
    }
    for (const arg of args) {
      if (
        (typeof arg === 'object' && arg !== null) ||
        typeof arg === 'function'
      ) {
        throw new Error(
          'Server preload resource keys must be primitive values',
        );
      }
    }
    const node = this.#lookup(this.#tasks, fn, args);
    let task = node?.task;
    if (task !== undefined) {
      if (!speculative && task.speculative) {
        task.speculative = false;
        this.#emit('consumed', task);
        if (task.status === 'queued') {
          this.#demand.push(task);
          this.#emit('promoted', task);
          this.#requestDrain(getBatch(task.fn) !== undefined);
        }
      }
      return task.promise;
    }
    const criticalPath = hint?.criticalPath?.length
      ? [...hint.criticalPath]
      : [label ?? fn.name];
    const priority =
      this.#scheduling === 'critical-path'
        ? criticalPath.reduce((total, resource) => {
            let duration = 1;
            try {
              const estimate = this.#estimateDurationMs?.(resource);
              if (
                estimate !== undefined &&
                Number.isFinite(estimate) &&
                estimate > 0
              ) {
                duration = estimate;
              }
            } catch {
              /* Profiling must never affect correctness. */
            }
            return Math.min(Number.MAX_VALUE, total + duration);
          }, 0)
        : 0;
    const id = this.#nextTask++;
    if (
      speculative &&
      (!(origin === 'route'
        ? this.features.routeManifests
        : this.features.preloading) ||
        !this.step())
    ) {
      this.#emit('dropped', {
        id,
        priority,
        criticalPath,
        name: label ?? fn.name,
        startedAt: null,
        speculative: true,
      });
      const promise = Promise.reject<PreloadResult<T>>(new PreloadCancelled());
      promise.catch(() => {});
      return promise;
    }
    let resolve!: (value: PreloadResult<T>) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<PreloadResult<T>>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    promise.catch(() => {});
    task = {
      id,
      priority,
      criticalPath,
      invokeBatch: (): void => {},
      fn,
      args,
      name: label ?? fn.name,
      startedAt: null,
      promise,
      resolve,
      reject,
      speculative,
      status: 'queued',
      start: (): void => {},
    };
    const current = task;
    task.start = this.#bind(() => {
      if (this.#closed || current.status !== 'queued') {
        return;
      }
      current.status = 'running';
      current.startedAt = performance.now();
      current.operation = {id: this.#nextOperation++, remaining: 1};
      this.#activeOperations++;
      this.#running.add(current);
      this.#emit('started', current);
      if (this.#closed || current.status !== 'running') {
        return;
      }
      try {
        // Resources promise ordinary native promises; assimilate once here.
        const result = fn(...args);
        result.then(
          this.#bind(value => this.#settle(current, true, value)),
          this.#bind(error => this.#settle(current, false, error)),
        );
      } catch (error) {
        this.#settle(current, false, error);
      }
    });
    task.invokeBatch = this.#bind((batch, tasks, operation) => {
      for (const member of tasks) {
        member.status = 'running';
        member.startedAt = performance.now();
        member.operation = operation;
        member.batchSize = tasks.length;
        this.#running.add(member);
      }
      for (const member of tasks) {
        this.#emit('started', member);
      }
      if (this.#closed) {
        return;
      }
      try {
        const keys = tasks.map(member => Object.freeze([...member.args]));
        const fail = this.#bind((error: unknown): void => {
          for (const member of tasks) {
            this.#settle(member, false, error);
          }
        });
        const completion = batch.load(Object.freeze(keys)).then(
          this.#bind(results => {
            const invalid = (): Error =>
              new Error(
                'A server preload batch must return one fulfilled/rejected result per key, in key order',
              );
            if (!Array.isArray(results) || results.length !== tasks.length) {
              throw invalid();
            }
            // Validate the entire result, including sparse arrays, before settling any key.
            const normalized = Array.from(results, result => {
              if (result == null) {
                throw invalid();
              }
              const status = result.status;
              if (status === 'fulfilled') {
                return {success: true, value: result.value};
              }
              if (status === 'rejected') {
                return {success: false, value: result.reason};
              }
              throw invalid();
            });
            normalized.forEach((result, index) =>
              this.#settle(tasks[index], result.success, result.value),
            );
          }),
          fail,
        );
        completion.catch(fail);
      } catch (error) {
        for (const member of tasks) {
          this.#settle(member, false, error);
        }
      }
    });
    const batch = getBatch(fn);
    if (
      speculative &&
      (batch !== undefined || this.#activeOperations >= this.#maxConcurrent) &&
      this.#queued >= this.#maxQueued
    ) {
      this.#emit('dropped', task);
      reject(new PreloadCancelled());
      return promise;
    }
    (node ?? this.#node(this.#tasks, fn, args)).task = task;
    if (
      batch === undefined &&
      this.#activeOperations < this.#maxConcurrent &&
      this.#queued === 0
    ) {
      task.start();
    } else {
      this.#queued++;
      (speculative ? this.#speculative : this.#demand).push(task);
      this.#emit('queued', task);
      this.#requestDrain(batch !== undefined);
    }
    return promise;
  }

  preload(fn: Read, args: Array<PreloadKey>): void {
    if (this.features.preloading) {
      this.read(fn, args, true);
    }
  }

  plan(
    fn: (...args: Array<any>) => unknown,
    args: Array<unknown>,
    invoke: () => void,
    origin: 'render' | 'route' = 'render',
  ): void {
    const node = this.#lookup(this.#plans, fn, args);
    if (
      !(origin === 'route'
        ? this.features.routeManifests
        : this.features.preloading) ||
      node?.started === true ||
      !this.step()
    ) {
      return;
    }
    /*
     * Plan identity is memoized independently of resource identity. A running
     * recursive edge cannot execute the plan again for the same input keys.
     */
    (node ?? this.#node(this.#plans, fn, args)).started = true;
    try {
      invoke();
    } catch {
      // The original component/helper remains responsible for consumed errors.
    }
  }

  #settle(task: Task, success: boolean, value: unknown): void {
    if (task.status !== 'running') {
      return;
    }
    this.#running.delete(task);
    if (task.operation !== undefined && --task.operation.remaining === 0) {
      this.#activeOperations--;
    }
    task.status = success ? 'fulfilled' : 'rejected';
    this.#emit(success ? 'fulfilled' : 'rejected', task);
    if (success) {
      const envelope = Object.create(null) as {value: unknown};
      envelope.value = value;
      task.resolve(envelope);
    } else {
      task.reject(value);
    }
    // Promise continuations can reveal critical dependent reads before speculation fills the slot.
    this.#requestDrain(true);
  }

  #requestDrain(defer: boolean): void {
    if (!defer) {
      this.#drain();
      return;
    }
    if (!this.#flushScheduled) {
      this.#flushScheduled = true;
      queueMicrotask(
        this.#bind(() => {
          this.#flushScheduled = false;
          this.#drain();
        }),
      );
    }
  }

  #take(queue: Array<Task>, prioritize: boolean): Task | undefined {
    let best = -1;
    for (let index = queue.length - 1; index >= 0; index--) {
      const task = queue[index];
      if (task.status !== 'queued') {
        queue.splice(index, 1);
      }
    }
    for (let index = 0; index < queue.length; index++) {
      if (
        best === -1 ||
        (prioritize &&
          this.#scheduling === 'critical-path' &&
          queue[index].priority > queue[best].priority)
      ) {
        best = index;
      }
    }
    return best === -1 ? undefined : queue.splice(best, 1)[0];
  }

  #drain(): void {
    if (this.#draining) {
      return;
    }
    this.#draining = true;
    try {
      while (!this.#closed && this.#activeOperations < this.#maxConcurrent) {
        const task =
          this.#take(this.#demand, false) ??
          this.#take(this.#speculative, true);
        if (task === undefined) {
          return;
        }
        // A promoted task may still have a stale entry in the speculative list.
        for (const queue of [this.#demand, this.#speculative]) {
          const duplicate = queue.indexOf(task);
          if (duplicate !== -1) {
            queue.splice(duplicate, 1);
          }
        }
        const batch = getBatch(task.fn);
        this.#queued--;
        if (batch === undefined) {
          task.start();
          continue;
        }
        const tasks = [task];
        // All admitted keys participate, even when the operation cap is one.
        for (const queue of [this.#demand, this.#speculative]) {
          for (
            let index = 0;
            index < queue.length &&
            tasks.length < (this.features.batching ? batch.maxBatchSize : 1);

          ) {
            const candidate = queue[index];
            if (
              candidate.status === 'queued' &&
              candidate.fn === task.fn &&
              !tasks.includes(candidate)
            ) {
              tasks.push(candidate);
              queue.splice(index, 1);
              this.#queued--;
              const other =
                queue === this.#demand ? this.#speculative : this.#demand;
              const duplicate = other.indexOf(candidate);
              if (duplicate !== -1) {
                other.splice(duplicate, 1);
              }
            } else {
              index++;
            }
          }
        }
        const operation = {id: this.#nextOperation++, remaining: tasks.length};
        this.#activeOperations++;
        task.invokeBatch(batch, tasks, operation);
      }
    } finally {
      this.#draining = false;
    }
  }

  /** Cancels ownership of queued/observed work, never another owner's I/O. */
  close(reason: unknown = new PreloadCancelled()): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#reason = reason;
    this.#removeAbortListener?.();
    this.#removeAbortListener = null;
    const tasks = new Set([
      ...this.#running,
      ...this.#demand,
      ...this.#speculative,
    ]);
    this.#running.clear();
    this.#demand.length = 0;
    this.#speculative.length = 0;
    this.#queued = 0;
    this.#activeOperations = 0;
    this.#tasks.clear();
    this.#plans.clear();
    for (const task of tasks) {
      if (task.status === 'queued' || task.status === 'running') {
        task.status = 'rejected';
        task.reject(reason);
        this.#emit('cancelled', task);
      }
    }
  }
}
