/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {atom} from 'jotai';
import {atomFamily} from 'jotai-family';
import {createCard, renamedCardId} from './data.js';

// An atom per card, and a derived atom per card for whether it is selected:
// only the components whose atoms change render.
export const cardAtom = atomFamily(id => atom(createCard(id)));
export const selectedIdAtom = atom(null);
export const isSelectedAtom = atomFamily(id =>
  atom(get => get(selectedIdAtom) === id)
);
export const notificationsAtom = atom(0);
const renamesAtom = atom(0);
export const renameNextAtom = atom(null, (get, set) => {
  const renames = get(renamesAtom);
  const card = cardAtom(renamedCardId(renames));
  set(renamesAtom, renames + 1);
  set(card, value => ({...value, title: value.title + '!'}));
});
