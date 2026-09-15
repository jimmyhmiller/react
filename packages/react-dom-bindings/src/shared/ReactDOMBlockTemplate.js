/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {REACT_BLOCK_TEMPLATE_TYPE} from 'shared/ReactSymbols';
import {enableCompiledBlocks} from 'shared/ReactFeatureFlags';

// See react-dom-bindings/src/client/ReactDOMBlocks for the description format.
export type BlockNodeDescription = [
  string,
  null | {+[propName: string]: mixed},
  null | $ReadOnlyArray<[string, number]>,
  $ReadOnlyArray<BlockChildDescription>,
];

export type BlockChildDescription =
  | string
  | BlockNodeDescription
  | {+t: number}
  | {+s: number};

export type BlockTemplate = {
  $$typeof: symbol,
  description: BlockNodeDescription,
  // Lazily computed by the client renderer.
  _analysis: mixed,
  _prototype: null | Element,
  _prototypeDocument: null | Document,
};

export function createBlockTemplate(
  description: BlockNodeDescription,
): BlockTemplate {
  if (!enableCompiledBlocks) {
    throw new Error('Compiled blocks are not enabled in this build of React.');
  }
  return {
    $$typeof: REACT_BLOCK_TEMPLATE_TYPE,
    description,
    _analysis: null,
    _prototype: null,
    _prototypeDocument: null,
  };
}

export function isBlockTemplate(type: mixed): boolean {
  return (
    typeof type === 'object' &&
    type !== null &&
    type.$$typeof === REACT_BLOCK_TEMPLATE_TYPE
  );
}
