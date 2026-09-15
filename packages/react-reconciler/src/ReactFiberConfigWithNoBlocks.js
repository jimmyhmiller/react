/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// Renderers that don't support compiled blocks
// can re-export everything from this module.

function shim(...args: any): empty {
  throw new Error(
    'The current renderer does not support compiled blocks. ' +
      'This error is likely caused by a bug in React. ' +
      'Please file an issue.',
  );
}

// Compiled blocks (when unsupported)
export const supportsBlocks = false;
export const isBlockTemplate = shim;
export const getBlockSlotCount = shim;
export const getBlockSlotValue = shim;
export const createBlockInstance = shim;
export const blockValuesChanged = shim;
export const commitBlockUpdate = shim;
export const getBlockSlotParent = shim;
export const getBlockSlotPosition = shim;
export const getBlockSlotNextStaticSibling = shim;
export const getBlockSlotValueKind = shim;
export const BlockSlotInline = 0;
export const BlockSlotList = 1;
export const BlockSlotFiber = 2;
export const blockListItemNeedsFiber = shim;
export const blockSlotNeedsCommit = shim;
export const getBlockSlotInlineNode = shim;
export const setBlockSlotContent = shim;
export const getBlockSlotInlineItems = shim;
export const getBlockInlineItemSlotItems = shim;
export const getBlockInlineItemKey = shim;
export const getBlockInlineItemTemplate = shim;
export const getBlockInlineItemRoot = shim;
export const adoptBlockInlineItem = shim;
export const getBlockValues = shim;
export type BlockInlineItem = mixed;
