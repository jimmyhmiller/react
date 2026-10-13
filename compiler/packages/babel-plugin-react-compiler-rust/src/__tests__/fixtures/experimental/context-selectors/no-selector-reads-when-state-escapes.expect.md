
## Input

```javascript
// @enableContextSelectors @enableSelectorReads @compilationMode:"infer"
// Selectors whose reads of the state cannot be described by top-level keys:
// no keys are passed, so React checks these calls on every store change.
import {useBoardStore, selectRows} from './store';

function count(state) {
  return state.rows.length;
}

export function PassesState() {
  const n = useBoardStore(state => count(state));
  return <span>{n}</span>;
}

export function ReturnsState() {
  const state = useBoardStore(state => state);
  return <span>{state.tick}</span>;
}

export function ComputedKey({key}) {
  const value = useBoardStore(state => state[key]);
  return <span>{value}</span>;
}

export function CapturesState() {
  const rows = useBoardStore(state => {
    const read = () => state.rows;
    return read();
  });
  return <span>{rows.length}</span>;
}

export function ImportedSelector() {
  const rows = useBoardStore(selectRows);
  return <span>{rows.length}</span>;
}

export function RestDestructuring() {
  const rest = useBoardStore(({tick, ...others}) => others.rows);
  return <span>{rest.length}</span>;
}

```

## Code

```javascript
import {
  c as _c,
  unstable_selectHookPaths,
  unstable_startSelectedHook,
} from "react/compiler-runtime"; // @enableContextSelectors @enableSelectorReads @compilationMode:"infer"
// Selectors whose reads of the state cannot be described by top-level keys:
// no keys are passed, so React checks these calls on every store change.
import { useBoardStore, selectRows } from "./store";

function count(state) {
  return state.rows.length;
}

export function PassesState() {
  const $ = _c(2);
  const n = useBoardStore(_temp);
  let t0;
  if ($[0] !== n) {
    t0 = <span>{n}</span>;
    $[0] = n;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  return t0;
}
function _temp(state) {
  return count(state);
}

export function ReturnsState() {
  const $ = _c(3);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [[0, "tick"]];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const _selectedHook = unstable_startSelectedHook(useBoardStore);
  const t1 = useBoardStore(_temp2);
  unstable_selectHookPaths(_selectedHook, t1, useBoardStore, t0);
  const state_0 = t1;
  let t2;
  if ($[1] !== state_0.tick) {
    t2 = <span>{state_0.tick}</span>;
    $[1] = state_0.tick;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  return t2;
}
function _temp2(state) {
  return state;
}

export function ComputedKey(t0) {
  const $ = _c(4);
  const { key } = t0;
  let t1;
  if ($[0] !== key) {
    t1 = (state) => state[key];
    $[0] = key;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const value = useBoardStore(t1);
  let t2;
  if ($[2] !== value) {
    t2 = <span>{value}</span>;
    $[2] = value;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  return t2;
}

export function CapturesState() {
  const $ = _c(3);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [[0, "length"]];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const _selectedHook2 = unstable_startSelectedHook(useBoardStore);
  const t1 = useBoardStore(_temp3);
  unstable_selectHookPaths(_selectedHook2, t1, useBoardStore, t0);
  const rows = t1;
  let t2;
  if ($[1] !== rows.length) {
    t2 = <span>{rows.length}</span>;
    $[1] = rows.length;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  return t2;
}
function _temp3(state) {
  const read = () => state.rows;
  return read();
}

export function ImportedSelector() {
  const $ = _c(3);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [[0, "length"]];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const _selectedHook3 = unstable_startSelectedHook(useBoardStore);
  const t1 = useBoardStore(selectRows);
  unstable_selectHookPaths(_selectedHook3, t1, useBoardStore, t0);
  const rows = t1;
  let t2;
  if ($[1] !== rows.length) {
    t2 = <span>{rows.length}</span>;
    $[1] = rows.length;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  return t2;
}

export function RestDestructuring() {
  const $ = _c(3);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [[0, "length"]];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const _selectedHook4 = unstable_startSelectedHook(useBoardStore);
  const t1 = useBoardStore(_temp4);
  unstable_selectHookPaths(_selectedHook4, t1, useBoardStore, t0);
  const rest = t1;
  let t2;
  if ($[1] !== rest.length) {
    t2 = <span>{rest.length}</span>;
    $[1] = rest.length;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  return t2;
}
function _temp4(t0) {
  const { tick, ...others } = t0;
  return others.rows;
}

```
