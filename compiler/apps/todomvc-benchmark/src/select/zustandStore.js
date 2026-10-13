/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {create} from 'zustand';
import {CARD_IDS, createCard, renamedCardId} from './data.js';

const cards = {};
for (const id of CARD_IDS) {
  cards[id] = createCard(id);
}

export const useSelectStore = create(set => ({
  cards,
  selectedId: null,
  notifications: 0,
  renames: 0,
  select: id => set({selectedId: id}),
  notify: () => set(state => ({notifications: state.notifications + 1})),
  renameNext: () =>
    set(state => {
      const id = renamedCardId(state.renames);
      const card = state.cards[id];
      return {
        renames: state.renames + 1,
        cards: {...state.cards, [id]: {...card, title: card.title + '!'}},
      };
    }),
}));
