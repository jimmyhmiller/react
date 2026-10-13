
## Input

```javascript
// @enableStateVariables
// An optional chain that is part of another expression, whose value nothing
// uses.
function List({item, enabled}) {
  let items = [];
  return (
    <>
      <button onClick={() => { enabled && items?.push(item); }}>add</button>
      <button onClick={() => { enabled ? items?.pop() : items?.reverse(); }}>undo</button>
      {items?.length}
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
// An optional chain that is part of another expression, whose value nothing
// uses.
function List(t0) {
  const $ = _c(10);
  const { item, enabled } = t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = [];
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const [items, setItems] = useState(t1);
  unstable_freezeState(items);
  let t2;
  if ($[1] !== enabled || $[2] !== item) {
    t2 = (
      <button
        onClick={() => {
          enabled &&
            setItems((items$0) => {
              if (items$0 == null) {
                return items$0;
              }
              const t3 = unstable_copyForUpdate(items$0);
              t3.push(item);
              return t3;
            });
        }}
      >
        add
      </button>
    );
    $[1] = enabled;
    $[2] = item;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== enabled) {
    t3 = (
      <button
        onClick={() => {
          enabled ? setItems(_temp) : setItems(_temp2);
        }}
      >
        undo
      </button>
    );
    $[4] = enabled;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  const t4 = items?.length;
  let t5;
  if ($[6] !== t2 || $[7] !== t3 || $[8] !== t4) {
    t5 = (
      <>
        {t2}
        {t3}
        {t4}
      </>
    );
    $[6] = t2;
    $[7] = t3;
    $[8] = t4;
    $[9] = t5;
  } else {
    t5 = $[9];
  }
  return t5;
}
function _temp2(items) {
  if (items == null) {
    return items;
  }
  const t0 = unstable_copyForUpdate(items);
  t0.reverse();
  return t0;
}
function _temp(items) {
  if (items == null) {
    return items;
  }
  const t0 = unstable_copyForUpdate(items);
  t0.pop();
  return t0;
}

```
