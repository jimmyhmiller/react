/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {create} from 'zustand';
import {createBoardData, nextColumnId, presenceAt} from './data.js';

export const useBoardStore = create(set => {
  const {users, columns, cards, currentUserId} = createBoardData();
  return {
    users,
    columns,
    cards,
    currentUser: users.find(user => user.id === currentUserId),
    selectedCardId: null,
    filter: '',
    onlyMine: false,
    starred: {},
    theme: 'light',
    notifications: 0,
    presenceTick: 0,
    presence: presenceAt(users, 0),

    selectCard: id => set({selectedCardId: id}),
    closeDetails: () => set({selectedCardId: null}),
    setFilter: filter => set({filter}),
    toggleOnlyMine: () => set(state => ({onlyMine: !state.onlyMine})),
    toggleTheme: () =>
      set(state => ({theme: state.theme === 'dark' ? 'light' : 'dark'})),
    toggleStar: id =>
      set(state => {
        const starred = {...state.starred};
        if (starred[id]) {
          delete starred[id];
        } else {
          starred[id] = true;
        }
        return {starred};
      }),
    moveCard: id =>
      set(state => {
        const card = state.cards.find(c => c.id === id);
        const moved = {
          ...card,
          columnId: nextColumnId(state.columns, card.columnId),
        };
        return {cards: state.cards.filter(c => c.id !== id).concat(moved)};
      }),
    renameCard: (id, title) =>
      set(state => ({
        cards: state.cards.map(c => (c.id === id ? {...c, title} : c)),
      })),
    tickNotifications: () =>
      set(state => ({notifications: state.notifications + 1})),
    tickPresence: () =>
      set(state => ({
        presenceTick: state.presenceTick + 1,
        presence: presenceAt(state.users, state.presenceTick + 1),
      })),
  };
});
