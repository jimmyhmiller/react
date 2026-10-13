
## Input

```javascript
// @enableStateVariables
// Writes in loops, branches, a switch and a try block. A `try` block ends at
// every call, so the read and the write of `count++` are in different blocks
// there and the write sets the value.
function Counter({items, mode}) {
  let count = 0;
  let list = [];
  return (
    <>
      <button
        onClick={() => {
          for (const item of items) {
            list.push(item);
            count += item;
          }
        }}>
        all
      </button>
      <button
        onClick={() => {
          if (mode) {
            count++;
          } else {
            count = 0;
          }
          console.log(count);
        }}>
        branch
      </button>
      <button
        onClick={() => {
          switch (mode) {
            case 1:
              count++;
              break;
            default:
              list.pop();
          }
        }}>
        switch
      </button>
      <button
        onClick={() => {
          try {
            count++;
            risky();
          } catch (e) {
            count = -1;
          }
        }}>
        try
      </button>
      {count} {list.length}
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
// Writes in loops, branches, a switch and a try block. A `try` block ends at
// every call, so the read and the write of `count++` are in different blocks
// there and the write sets the value.
function Counter(t0) {
  const $ = _c(17);
  const { items, mode } = t0;
  const [count, setCount] = useState(0);
  unstable_freezeState(count);
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = [];
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const [list, setList] = useState(t1);
  unstable_freezeState(list);
  let t2;
  if ($[1] !== items) {
    t2 = (
      <button
        onClick={() => {
          for (const item of items) {
            setList((list$0) => {
              const t3 = unstable_copyForUpdate(list$0);
              t3.push(item);
              return t3;
            });
            setCount((count$0) => count$0 + item);
          }
        }}
      >
        all
      </button>
    );
    $[1] = items;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== count || $[4] !== mode) {
    t3 = (
      <button
        onClick={() => {
          let currentCount = count;
          if (mode) {
            currentCount = currentCount + 1;
            setCount(_temp);
          } else {
            currentCount = 0;
            setCount(0);
          }

          console.log(currentCount);
        }}
      >
        branch
      </button>
    );
    $[3] = count;
    $[4] = mode;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  let t4;
  if ($[6] !== mode) {
    t4 = (
      <button
        onClick={() => {
          bb11: switch (mode) {
            case 1: {
              setCount(_temp2);
              break bb11;
            }
            default: {
              setList(_temp3);
            }
          }
        }}
      >
        switch
      </button>
    );
    $[6] = mode;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  let t5;
  if ($[8] !== count) {
    t5 = (
      <button
        onClick={() => {
          try {
            setCount(count + 1);
            risky();
          } catch (t6) {
            setCount(-1);
          }
        }}
      >
        try
      </button>
    );
    $[8] = count;
    $[9] = t5;
  } else {
    t5 = $[9];
  }
  let t6;
  if (
    $[10] !== count ||
    $[11] !== list.length ||
    $[12] !== t2 ||
    $[13] !== t3 ||
    $[14] !== t4 ||
    $[15] !== t5
  ) {
    t6 = (
      <>
        {t2}
        {t3}
        {t4}
        {t5}
        {count} {list.length}
      </>
    );
    $[10] = count;
    $[11] = list.length;
    $[12] = t2;
    $[13] = t3;
    $[14] = t4;
    $[15] = t5;
    $[16] = t6;
  } else {
    t6 = $[16];
  }
  return t6;
}
function _temp3(list) {
  const t0 = unstable_copyForUpdate(list);
  t0.pop();
  return t0;
}
function _temp2(count) {
  return count + 1;
}
function _temp(count) {
  return count + 1;
}

```
