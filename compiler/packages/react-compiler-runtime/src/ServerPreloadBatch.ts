/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {PreloadKey} from './ServerPreloadScheduler';

export type BatchResult<T> =
  | {status: 'fulfilled'; value: T}
  | {status: 'rejected'; reason: unknown};
export type BatchOptions = {maxBatchSize?: number};
export type BatchDefinition = {
  load: (
    keys: ReadonlyArray<ReadonlyArray<PreloadKey>>,
  ) => Promise<ReadonlyArray<BatchResult<unknown>>>;
  maxBatchSize: number;
};
const definitions = new WeakMap<
  (...args: Array<any>) => Promise<any>,
  BatchDefinition
>();

/** Metadata contains no request data; results and pending keys belong to the scheduler. */
export function registerBatch<Args extends ReadonlyArray<PreloadKey>, T>(
  resource: (...args: Args) => Promise<T>,
  load: (keys: ReadonlyArray<Args>) => Promise<ReadonlyArray<BatchResult<T>>>,
  options: BatchOptions,
): void {
  const size = options.maxBatchSize ?? 100;
  if (!Number.isSafeInteger(size) || size < 1) {
    throw new Error('maxBatchSize must be a positive safe integer');
  }
  definitions.set(resource, {
    load: load as BatchDefinition['load'],
    maxBatchSize: size,
  });
}

export function getBatch(
  resource: (...args: Array<any>) => Promise<any>,
): BatchDefinition | undefined {
  return definitions.get(resource);
}
