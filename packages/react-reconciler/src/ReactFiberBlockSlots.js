/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber} from './ReactInternalTypes';
import type {Instance} from './ReactFiberConfig';

// The host instances of the items of a list slot's value that have fibers, by
// item index. A list slot fiber's children are the fibers of those items, and
// each one's index is its item's index in the list (see updateHostBlock).
export function getBlockSlotFiberItems(
  slot: Fiber,
  length: number,
): Array<null | Instance> {
  const items: Array<null | Instance> = new Array<null | Instance>(length).fill(
    null,
  );
  let fiber: Fiber | null = slot.child;
  while (fiber !== null) {
    items[fiber.index] = fiber.stateNode;
    fiber = fiber.sibling;
  }
  return items;
}
