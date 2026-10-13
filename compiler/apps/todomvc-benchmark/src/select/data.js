/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// 1,000 cards, rendered by the same UI with different state management: a
// Zustand store read by comparing in render, a Zustand store read by
// comparing in the selector, and Jotai atoms (an atom per card).
export const CARD_COUNT = 1000;

export const CARD_IDS = Array.from({length: CARD_COUNT}, (_, i) => i);

export function createCard(id) {
  return {id, title: `Card ${id}`};
}

// The card renamed by the n-th rename.
export function renamedCardId(n) {
  return (n * 37) % CARD_COUNT;
}
