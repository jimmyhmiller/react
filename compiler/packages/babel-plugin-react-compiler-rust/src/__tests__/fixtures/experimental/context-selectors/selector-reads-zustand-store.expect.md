
## Input

```javascript
// @enableContextSelectors @enableSelectorReads @compilationMode:"infer"
// The store hook is registered with its state getter, and each call passes
// the top-level keys of the state that its inline selector reads, whether or
// not the returned value is selected.
import {create} from 'zustand';

export const useBoardStore = create(set => ({
  rows: [],
  labels: {},
  tick: 0,
  bump: () => set(state => ({tick: state.tick + 1})),
}));

export function Cell({id}) {
  const row = useBoardStore(state => state.rows[id]);
  return <span>{row.label}</span>;
}

export function Tick() {
  const tick = useBoardStore(state => state.tick);
  return <output>{tick}</output>;
}

export function Label({id}) {
  const label = useBoardStore(({rows, labels}) => labels[rows[id].labelId]);
  return <b>{label}</b>;
}

export function Named({id}) {
  const select = state => {
    const s = state;
    return s.rows[id];
  };
  const row = useBoardStore(select);
  return <i>{row.label}</i>;
}

```

## Code

```javascript
import {
  c as _c,
  unstable_registerStoreHook,
  unstable_selectHookPaths,
  unstable_startSelectedHook,
} from "react/compiler-runtime"; // @enableContextSelectors @enableSelectorReads @compilationMode:"infer"
// The store hook is registered with its state getter, and each call passes
// the top-level keys of the state that its inline selector reads, whether or
// not the returned value is selected.
import { create } from "zustand";

export const useBoardStore = create((set) => ({
  rows: [],
  labels: {},
  tick: 0,
  bump: () => set((state) => ({ tick: state.tick + 1 })),
}));
unstable_registerStoreHook(useBoardStore, useBoardStore.getState);

export function Cell(t0) {
  const $ = _c(6);
  const { id } = t0;
  let t1;
  if ($[0] !== id) {
    t1 = (state) => state.rows[id];
    $[0] = id;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = [[0, "label"]];
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  const _selectedHook = unstable_startSelectedHook(useBoardStore);
  let t3;
  if ($[3] === Symbol.for("react.memo_cache_sentinel")) {
    t3 = ["rows"];
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  const t4 = useBoardStore(t1);
  unstable_selectHookPaths(_selectedHook, t4, useBoardStore, t2, t3);
  const row = t4;
  let t5;
  if ($[4] !== row.label) {
    t5 = <span>{row.label}</span>;
    $[4] = row.label;
    $[5] = t5;
  } else {
    t5 = $[5];
  }
  return t5;
}

export function Tick() {
  const $ = _c(3);
  const _selectedHook2 = unstable_startSelectedHook(useBoardStore);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = ["tick"];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const t1 = useBoardStore(_temp);
  unstable_selectHookPaths(_selectedHook2, t1, useBoardStore, null, t0);
  const tick = t1;
  let t2;
  if ($[1] !== tick) {
    t2 = <output>{tick}</output>;
    $[1] = tick;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  return t2;
}
function _temp(state) {
  return state.tick;
}

export function Label(t0) {
  const $ = _c(5);
  const { id } = t0;
  let t1;
  if ($[0] !== id) {
    t1 = (t2) => {
      const { rows, labels } = t2;
      return labels[rows[id].labelId];
    };
    $[0] = id;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const _selectedHook3 = unstable_startSelectedHook(useBoardStore);
  let t2;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = ["rows", "labels"];
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  const t3 = useBoardStore(t1);
  unstable_selectHookPaths(_selectedHook3, t3, useBoardStore, null, t2);
  const label = t3;
  let t4;
  if ($[3] !== label) {
    t4 = <b>{label}</b>;
    $[3] = label;
    $[4] = t4;
  } else {
    t4 = $[4];
  }
  return t4;
}

export function Named(t0) {
  const $ = _c(6);
  const { id } = t0;
  let t1;
  if ($[0] !== id) {
    t1 = (state) => {
      const s = state;
      return s.rows[id];
    };
    $[0] = id;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const select = t1;
  let t2;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = [[0, "label"]];
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  const _selectedHook4 = unstable_startSelectedHook(useBoardStore);
  let t3;
  if ($[3] === Symbol.for("react.memo_cache_sentinel")) {
    t3 = ["rows"];
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  const t4 = useBoardStore(select);
  unstable_selectHookPaths(_selectedHook4, t4, useBoardStore, t2, t3);
  const row = t4;
  let t5;
  if ($[4] !== row.label) {
    t5 = <i>{row.label}</i>;
    $[4] = row.label;
    $[5] = t5;
  } else {
    t5 = $[5];
  }
  return t5;
}

```
