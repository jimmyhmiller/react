/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {configureStore, createSlice} from '@reduxjs/toolkit';
import {createBoardData, nextColumnId, presenceAt} from './data.js';

const data = createBoardData();

// Cards are normalized by id, with the ids of each column's cards in order.
const boardSlice = createSlice({
  name: 'board',
  initialState: () => {
    const cards = {};
    const cardIdsByColumn = {};
    for (const column of data.columns) {
      cardIdsByColumn[column.id] = [];
    }
    for (const card of data.cards) {
      cards[card.id] = card;
      cardIdsByColumn[card.columnId].push(card.id);
    }
    return {columns: data.columns, cards, cardIdsByColumn};
  },
  reducers: {
    moveCard(state, action) {
      const card = state.cards[action.payload];
      const from = card.columnId;
      const to = nextColumnId(state.columns, from);
      state.cardIdsByColumn[from] = state.cardIdsByColumn[from].filter(
        id => id !== card.id,
      );
      state.cardIdsByColumn[to].push(card.id);
      card.columnId = to;
    },
    renameCard(state, action) {
      state.cards[action.payload.id].title = action.payload.title;
    },
  },
});

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    selectedCardId: null,
    filter: '',
    onlyMine: false,
    starred: {},
    theme: 'light',
  },
  reducers: {
    selectCard(state, action) {
      state.selectedCardId = action.payload;
    },
    closeDetails(state) {
      state.selectedCardId = null;
    },
    setFilter(state, action) {
      state.filter = action.payload;
    },
    toggleOnlyMine(state) {
      state.onlyMine = !state.onlyMine;
    },
    toggleStar(state, action) {
      if (state.starred[action.payload]) {
        delete state.starred[action.payload];
      } else {
        state.starred[action.payload] = true;
      }
    },
    toggleTheme(state) {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
    },
  },
});

const sessionSlice = createSlice({
  name: 'session',
  initialState: {
    users: data.users,
    currentUserId: data.currentUserId,
    notifications: 0,
    presenceTick: 0,
    presence: presenceAt(data.users, 0),
  },
  reducers: {
    tickNotifications(state) {
      state.notifications += 1;
    },
    tickPresence(state) {
      state.presenceTick += 1;
      state.presence = presenceAt(state.users, state.presenceTick);
    },
  },
});

export const {moveCard, renameCard} = boardSlice.actions;
export const {
  selectCard,
  closeDetails,
  setFilter,
  toggleOnlyMine,
  toggleStar,
  toggleTheme,
} = uiSlice.actions;
export const {tickNotifications, tickPresence} = sessionSlice.actions;

export const store = configureStore({
  reducer: {
    board: boardSlice.reducer,
    ui: uiSlice.reducer,
    session: sessionSlice.reducer,
  },
  // Production behavior: the development-only checks are not part of the
  // benchmark.
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({immutableCheck: false, serializableCheck: false}),
  devTools: false,
});
