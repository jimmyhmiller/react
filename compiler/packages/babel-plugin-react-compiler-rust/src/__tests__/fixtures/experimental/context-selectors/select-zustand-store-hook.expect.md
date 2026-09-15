
## Input

```javascript
// @enableContextSelectors @compilationMode:"infer"
// Hooks created by Zustand's `create` return the selection of the store's
// state, so the module registers them. Reads of their values are selected:
// a card only renders when whether it is selected or starred changes.
import {create} from 'zustand';

export const useBoardStore = create(set => ({
  selectedCardId: null,
  starred: {},
  selectCard: id => set({selectedCardId: id}),
}));

export function Card({card}) {
  const selectedCardId = useBoardStore(state => state.selectedCardId);
  const starred = useBoardStore(state => state.starred);
  const selectCard = useBoardStore(state => state.selectCard);
  const isSelected = card.id === selectedCardId;
  const isStarred = starred[card.id] === true;
  return (
    <li className={isSelected ? 'selected' : ''} onClick={() => selectCard(card.id)}>
      {isStarred ? '★' : '☆'} {card.title}
    </li>
  );
}

```

## Code

```javascript
import {
  c as _c,
  unstable_registerStoreHook,
  unstable_selectHookPaths,
  unstable_startSelectedHook,
} from "react/compiler-runtime"; // @enableContextSelectors @compilationMode:"infer"
// Hooks created by Zustand's `create` return the selection of the store's
// state, so the module registers them. Reads of their values are selected:
// a card only renders when whether it is selected or starred changes.
import { create } from "zustand";

export const useBoardStore = create((set) => ({
  selectedCardId: null,
  starred: {},
  selectCard: (id) => set({ selectedCardId: id }),
}));
unstable_registerStoreHook(useBoardStore);

export function Card(t0) {
  const $ = _c(12);
  const { card } = t0;
  let t1;
  if ($[0] !== card.id) {
    t1 = [[1, card.id]];
    $[0] = card.id;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const _selectedHook = unstable_startSelectedHook(useBoardStore);
  const t2 = useBoardStore(_temp);
  unstable_selectHookPaths(_selectedHook, t2, useBoardStore, t1);
  const selectedCardId = t2;
  let t3;
  if ($[2] !== card.id) {
    t3 = [[1, true, card.id]];
    $[2] = card.id;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  const _selectedHook2 = unstable_startSelectedHook(useBoardStore);
  const t4 = useBoardStore(_temp2);
  unstable_selectHookPaths(_selectedHook2, t4, useBoardStore, t3);
  const starred = t4;
  const selectCard = useBoardStore(_temp3);
  const isSelected = card.id === selectedCardId;
  const isStarred = starred[card.id] === true;

  const t5 = isSelected ? "selected" : "";
  let t6;
  if ($[4] !== card.id || $[5] !== selectCard) {
    t6 = () => selectCard(card.id);
    $[4] = card.id;
    $[5] = selectCard;
    $[6] = t6;
  } else {
    t6 = $[6];
  }
  const t7 = isStarred ? "\u2605" : "\u2606";
  let t8;
  if ($[7] !== card.title || $[8] !== t5 || $[9] !== t6 || $[10] !== t7) {
    t8 = (
      <li className={t5} onClick={t6}>
        {t7} {card.title}
      </li>
    );
    $[7] = card.title;
    $[8] = t5;
    $[9] = t6;
    $[10] = t7;
    $[11] = t8;
  } else {
    t8 = $[11];
  }
  return t8;
}
function _temp3(state_1) {
  return state_1.selectCard;
}
function _temp2(state_0) {
  return state_0.starred;
}
function _temp(state) {
  return state.selectedCardId;
}

```
      