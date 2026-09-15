/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Focuses an element once it is mounted, like React's autoFocus.
export function focusOnMount(node) {
  node.focus();
}
