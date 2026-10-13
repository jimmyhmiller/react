
## Input

```javascript
// @enableStateVariables
// An assignment that is part of an expression: the call of the setter joins
// the expression, and the value of the assignment is what was assigned.
function Counter({enabled, onChange}) {
  let count = 0;
  return (
    <>
      <button onClick={() => { enabled && (count = 5); }}>set</button>
      <button onClick={() => { enabled ? count++ : count--; }}>step</button>
      <button onClick={() => onChange((count = count * 2))}>double</button>
      {count}
    </>
  );
}

```

## Code

```javascript
import { useState } from "react";
import { c as _c, unstable_freezeState } from "react/compiler-runtime"; // @enableStateVariables
// An assignment that is part of an expression: the call of the setter joins
// the expression, and the value of the assignment is what was assigned.
function Counter(t0) {
  const $ = _c(13);
  const { enabled, onChange } = t0;
  const [count, setCount] = useState(0);
  unstable_freezeState(count);
  let t1;
  if ($[0] !== enabled) {
    t1 = (
      <button
        onClick={() => {
          enabled && (setCount(5), 5);
        }}
      >
        set
      </button>
    );
    $[0] = enabled;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== count || $[3] !== enabled) {
    t2 = (
      <button
        onClick={() => {
          enabled ? (setCount(_temp), count) : (setCount(_temp2), count);
        }}
      >
        step
      </button>
    );
    $[2] = count;
    $[3] = enabled;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  let t3;
  if ($[5] !== count || $[6] !== onChange) {
    t3 = (
      <button
        onClick={() => {
          let currentCount2 = count;
          currentCount2 = currentCount2 * 2;
          setCount(_temp3);
          onChange(currentCount2);
        }}
      >
        double
      </button>
    );
    $[5] = count;
    $[6] = onChange;
    $[7] = t3;
  } else {
    t3 = $[7];
  }
  let t4;
  if ($[8] !== count || $[9] !== t1 || $[10] !== t2 || $[11] !== t3) {
    t4 = (
      <>
        {t1}
        {t2}
        {t3}
        {count}
      </>
    );
    $[8] = count;
    $[9] = t1;
    $[10] = t2;
    $[11] = t3;
    $[12] = t4;
  } else {
    t4 = $[12];
  }
  return t4;
}
function _temp3(count) {
  return count * 2;
}
function _temp2(count) {
  return count - 1;
}
function _temp(count) {
  return count + 1;
}

```
