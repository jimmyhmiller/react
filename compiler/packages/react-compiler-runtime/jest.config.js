/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
module.exports = {
  displayName: 'server-preload-runtime',
  preset: 'ts-jest',
  rootDir: '.',
  testMatch: ['<rootDir>/src/__tests__/*-test.ts'],
  testEnvironment: 'node',
};
