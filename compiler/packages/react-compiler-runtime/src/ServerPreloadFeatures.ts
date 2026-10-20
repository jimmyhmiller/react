/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export type ServerPreloadFeatures = {
  preloading: boolean;
  batching: boolean;
  criticalPath: boolean;
  routeManifests: boolean;
  deferAwait: boolean;
  lens: boolean;
};
export const defaultServerPreloadFeatures: Readonly<ServerPreloadFeatures> =
  Object.freeze({
    preloading: true,
    batching: true,
    criticalPath: true,
    routeManifests: false,
    deferAwait: false,
    lens: true,
  });
export function resolveServerPreloadFeatures(
  features: Partial<ServerPreloadFeatures> = {},
): Readonly<ServerPreloadFeatures> {
  const result = {...defaultServerPreloadFeatures};
  for (const key of Object.keys(features)) {
    if (
      !Object.prototype.hasOwnProperty.call(result, key) ||
      typeof features[key as keyof ServerPreloadFeatures] !== 'boolean'
    ) {
      throw new Error(`Invalid server preload feature: ${key}`);
    }
    result[key as keyof ServerPreloadFeatures] =
      features[key as keyof ServerPreloadFeatures]!;
  }
  return Object.freeze(result);
}
