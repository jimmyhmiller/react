/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

describe('list identities', () => {
  it('shares identity across separately bundled copies of the helper', () => {
    let producer;
    let consumer;
    jest.isolateModules(() => {
      producer = require('shared/ReactListIdentity').default;
    });
    jest.isolateModules(() => {
      consumer = require('shared/ReactListIdentity').default;
    });
    const list = [];
    const identity = producer(list);
    Object.freeze(list);
    expect(consumer(list)).toBe(identity);
    expect(consumer([])).not.toBe(identity);
    expect(Object.keys(list)).toEqual([]);
    expect({...list}).toEqual({});
    const {readListIdentity} = require('shared/ReactListIdentity');
    expect(readListIdentity(Object.freeze([]))).toBe(undefined);
  });
});
