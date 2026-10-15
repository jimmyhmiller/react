/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {REACT_LIST_IDENTITY} from './ReactSymbols';

// Tokens travel with the arrays because React and React DOM are separate
// bundles. A module-local map would give them different identities. Primitive
// tokens identify the base without retaining any previous result arrays.
export function readListIdentity(list: $ReadOnlyArray<mixed>): void | symbol {
  return (list: any)[REACT_LIST_IDENTITY];
}

export default function getListIdentity(list: $ReadOnlyArray<mixed>): symbol {
  let identity = readListIdentity(list);
  if (identity === undefined) {
    identity = Symbol();
    // Non-enumerable so object spread does not copy a list's identity. The
    // compiler runtime assigns it before exposing the result to user code.
    Object.defineProperty(list, REACT_LIST_IDENTITY, {value: identity});
  }
  return identity;
}
