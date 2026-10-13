
## Input

```javascript
// @enableStateVariables
// An updater captures what it does not compute from the state: a variable that
// is never reassigned (`step`), the value of another state variable in this
// render (`factor`), or a value computed before the write (`next()`), which is
// stored in a `const` so that it is computed once.
function Counter({step, next}) {
  let count = 0;
  let factor = 2;
  return (
    <>
      <button onClick={() => { count += step; }}>step</button>
      <button onClick={() => { count = count * factor; }}>scale</button>
      <button onClick={() => { const n = next(); count = count + n; }}>next</button>
      <button onClick={() => { count -= next() * 2; }}>inline</button>
      <button onClick={() => { factor++; }}>{count}</button>
    </>
  );
}

```

## Code

```javascript
import { useState } from "react";
import { c as _c, unstable_freezeState } from "react/compiler-runtime"; // @enableStateVariables
// An updater captures what it does not compute from the state: a variable that
// is never reassigned (`step`), the value of another state variable in this
// render (`factor`), or a value computed before the write (`next()`), which is
// stored in a `const` so that it is computed once.
function Counter(t0) {
  const $ = _c(18);
  const { step, next } = t0;
  const [count, setCount] = useState(0);
  unstable_freezeState(count);
  const [factor, setFactor] = useState(2);
  unstable_freezeState(factor);
  let t1;
  if ($[0] !== step) {
    t1 = (
      <button
        onClick={() => {
          setCount((count$0) => count$0 + step);
        }}
      >
        step
      </button>
    );
    $[0] = step;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== factor) {
    t2 = (
      <button
        onClick={() => {
          setCount((count$0) => count$0 * factor);
        }}
      >
        scale
      </button>
    );
    $[2] = factor;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== next) {
    t3 = (
      <button
        onClick={() => {
          const n = next();
          setCount((count$0) => count$0 + n);
        }}
      >
        next
      </button>
    );
    $[4] = next;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  let t4;
  if ($[6] !== count || $[7] !== next) {
    t4 = (
      <button
        onClick={() => {
          setCount(count - next() * 2);
        }}
      >
        inline
      </button>
    );
    $[6] = count;
    $[7] = next;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  let t5;
  if ($[9] === Symbol.for("react.memo_cache_sentinel")) {
    t5 = () => {
      setFactor(_temp);
    };
    $[9] = t5;
  } else {
    t5 = $[9];
  }
  let t6;
  if ($[10] !== count) {
    t6 = <button onClick={t5}>{count}</button>;
    $[10] = count;
    $[11] = t6;
  } else {
    t6 = $[11];
  }
  let t7;
  if (
    $[12] !== t1 ||
    $[13] !== t2 ||
    $[14] !== t3 ||
    $[15] !== t4 ||
    $[16] !== t6
  ) {
    t7 = (
      <>
        {t1}
        {t2}
        {t3}
        {t4}
        {t6}
      </>
    );
    $[12] = t1;
    $[13] = t2;
    $[14] = t3;
    $[15] = t4;
    $[16] = t6;
    $[17] = t7;
  } else {
    t7 = $[17];
  }
  return t7;
}
function _temp(factor) {
  return factor + 1;
}

```
