/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Row data for the js-framework-benchmark implementations of the other
// frameworks. Identical to the generator in ../RowsApp.jsx (same word lists,
// seeded Park-Miller generator and ids), so every implementation renders the
// same rows.

const adjectives = [
  'pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome',
  'plain', 'quaint', 'clean', 'elegant', 'easy', 'angry', 'crazy', 'helpful',
  'mushy', 'odd', 'unsightly', 'adorable', 'important', 'inexpensive',
  'cheap', 'expensive', 'fancy',
];
const colours = [
  'red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown',
  'white', 'black', 'orange',
];
const nouns = [
  'table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie',
  'sandwich', 'burger', 'pizza', 'mouse', 'keyboard',
];

let seed = 1;
function random(max) {
  // Park-Miller LCG.
  seed = (seed * 48271) % 2147483647;
  return seed % max;
}

let nextId = 1;

/** Returns `count` new rows as `createRow(id, label)`. */
export function buildRows(count, createRow) {
  const rows = new Array(count);
  for (let i = 0; i < count; i++) {
    rows[i] = createRow(
      nextId++,
      `${adjectives[random(adjectives.length)]} ${
        colours[random(colours.length)]
      } ${nouns[random(nouns.length)]}`,
    );
  }
  return rows;
}
