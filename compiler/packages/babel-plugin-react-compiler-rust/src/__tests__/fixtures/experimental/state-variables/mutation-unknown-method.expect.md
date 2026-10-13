
## Input

```javascript
// @enableStateVariables
// The compiler knows nothing about `splice` or `sort`, nor about any method of
// `items`, whose type is unknown. A call whose result is not used can only have
// been made for its effect on the receiver, so it is an update. A method that
// the built-in collections declare as read-only (`forEach`) is not, and neither
// is a call whose result is used (`slice`).
function List({initial, log}) {
  let items = initial;
  return (
    <>
      <button onClick={() => { items.splice(0, 1); }}>remove</button>
      <button onClick={() => { items.sort(); }}>sort</button>
      <button
        onClick={() => {
          items.forEach(item => log(item));
          const first = items.slice(0, 1);
          log(first);
        }}>
        log
      </button>
      {items.length}
    </>
  );
}

```

## Code

```javascript
import { useState } from "react";
import {
  c as _c,
  unstable_copyForUpdate,
  unstable_freezeState,
} from "react/compiler-runtime"; // @enableStateVariables
// The compiler knows nothing about `splice` or `sort`, nor about any method of
// `items`, whose type is unknown. A call whose result is not used can only have
// been made for its effect on the receiver, so it is an update. A method that
// the built-in collections declare as read-only (`forEach`) is not, and neither
// is a call whose result is used (`slice`).
function List(t0) {
  const $ = _c(8);
  const { initial, log } = t0;
  const [items, setItems] = useState(initial);
  unstable_freezeState(items);
  let t1;
  let t2;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = (
      <button
        onClick={() => {
          setItems(_temp);
        }}
      >
        remove
      </button>
    );
    t2 = (
      <button
        onClick={() => {
          setItems(_temp2);
        }}
      >
        sort
      </button>
    );
    $[0] = t1;
    $[1] = t2;
  } else {
    t1 = $[0];
    t2 = $[1];
  }
  let t3;
  if ($[2] !== items || $[3] !== log) {
    t3 = (
      <button
        onClick={() => {
          items.forEach((item) => log(item));
          const first = items.slice(0, 1);
          log(first);
        }}
      >
        log
      </button>
    );
    $[2] = items;
    $[3] = log;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  let t4;
  if ($[5] !== items.length || $[6] !== t3) {
    t4 = (
      <>
        {t1}
        {t2}
        {t3}
        {items.length}
      </>
    );
    $[5] = items.length;
    $[6] = t3;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  return t4;
}
function _temp2(items) {
  const t0 = unstable_copyForUpdate(items);
  t0.sort();
  return t0;
}
function _temp(items) {
  const t0 = unstable_copyForUpdate(items);
  t0.splice(0, 1);
  return t0;
}

```
