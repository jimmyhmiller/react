
## Input

```javascript
// @enableContextSelectors @enableUpdateSlicing @compilationMode:"infer"
// With update slicing, every call of a custom hook is made through the
// runtime, selected or not, so that React can skip calls of store hooks whose
// arguments are unchanged. Calls with more than three arguments are made
// directly.
import {create} from 'zustand';
import {useDispatch} from 'react-redux';

export const useBoardStore = create(set => ({
  theme: 'light',
  users: [],
}));

function useMany(a, b, c, d) {
  return a + b + c + d;
}

export function Card({card}) {
  const theme = useBoardStore(state => state.theme);
  const users = useBoardStore(state => state.users);
  const dispatch = useDispatch();
  const many = useMany(1, 2, 3, 4);
  const assignee = users.find(user => user.id === card.assigneeId);
  return (
    <li className={theme === 'dark' ? 'dark' : 'light'} onClick={() => dispatch(card.id)}>
      {assignee.name} {many}
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
  unstable_skipStoreHook0,
  unstable_skipStoreHook1,
  unstable_startSelectedHook,
} from "react/compiler-runtime"; // @enableContextSelectors @enableUpdateSlicing @compilationMode:"infer"
// With update slicing, every call of a custom hook is made through the
// runtime, selected or not, so that React can skip calls of store hooks whose
// arguments are unchanged. Calls with more than three arguments are made
// directly.
import { create } from "zustand";
import { useDispatch } from "react-redux";

export const useBoardStore = create((set) => ({
  theme: "light",
  users: [],
}));
unstable_registerStoreHook(useBoardStore);

function useMany(a, b, c, d) {
  return a + b + c + d;
}

export function Card(t0) {
  const $ = _c(14);
  const { card } = t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = [[1, "dark"]];
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const _selectedHook = unstable_startSelectedHook(useBoardStore);
  const _skippedHook = unstable_skipStoreHook1(
    _selectedHook,
    useBoardStore,
    _temp,
  );
  const t2 =
    _skippedHook !== useBoardStore ? _skippedHook : useBoardStore(_temp);
  unstable_selectHookPaths(_selectedHook, t2, useBoardStore, t1);
  const theme = t2;
  const _selectedHook2 = unstable_startSelectedHook(useBoardStore);
  const _skippedHook2 = unstable_skipStoreHook1(
    _selectedHook2,
    useBoardStore,
    _temp2,
  );
  const t3 =
    _skippedHook2 !== useBoardStore ? _skippedHook2 : useBoardStore(_temp2);
  unstable_selectHookPaths(_selectedHook2, t3, useBoardStore, null);
  const users = t3;
  const _selectedHook3 = unstable_startSelectedHook(useDispatch);
  const _skippedHook3 = unstable_skipStoreHook0(_selectedHook3, useDispatch);
  const t4 = _skippedHook3 !== useDispatch ? _skippedHook3 : useDispatch();
  unstable_selectHookPaths(_selectedHook3, t4, useDispatch, null);
  const dispatch = t4;
  const many = useMany(1, 2, 3, 4);
  let t5;
  if ($[1] !== card.assigneeId || $[2] !== users) {
    let t6;
    if ($[4] !== card.assigneeId) {
      t6 = (user) => user.id === card.assigneeId;
      $[4] = card.assigneeId;
      $[5] = t6;
    } else {
      t6 = $[5];
    }
    t5 = users.find(t6);
    $[1] = card.assigneeId;
    $[2] = users;
    $[3] = t5;
  } else {
    t5 = $[3];
  }
  const assignee = t5;

  const t6 = theme === "dark" ? "dark" : "light";
  let t7;
  if ($[6] !== card.id || $[7] !== dispatch) {
    t7 = () => dispatch(card.id);
    $[6] = card.id;
    $[7] = dispatch;
    $[8] = t7;
  } else {
    t7 = $[8];
  }
  let t8;
  if (
    $[9] !== assignee.name ||
    $[10] !== many ||
    $[11] !== t6 ||
    $[12] !== t7
  ) {
    t8 = (
      <li className={t6} onClick={t7}>
        {assignee.name} {many}
      </li>
    );
    $[9] = assignee.name;
    $[10] = many;
    $[11] = t6;
    $[12] = t7;
    $[13] = t8;
  } else {
    t8 = $[13];
  }
  return t8;
}
function _temp2(state_0) {
  return state_0.users;
}
function _temp(state) {
  return state.theme;
}

```
      