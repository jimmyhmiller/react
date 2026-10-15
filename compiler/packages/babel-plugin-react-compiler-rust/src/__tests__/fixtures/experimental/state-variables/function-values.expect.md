
## Input

```javascript
// @enableStateVariables

// Initializers and assignments preserve callable values; React must not call
// them as lazy initializers or functional updaters.
export function FunctionState({initial, next, observe}) {
  let value = initial;
  return (
    <button onClick={() => {
      value = next;
      observe(value);
    }}>
      {typeof value}
    </button>
  );
}

export function InlineFunctionState() {
  let value = () => 'initial';
  return <button onClick={() => { value = () => 'next'; }}>{value()}</button>;
}

```

## Code

```javascript
import { useState } from "react";
import { c as _c, unstable_freezeState } from "react/compiler-runtime"; // @enableStateVariables

// Initializers and assignments preserve callable values; React must not call
// them as lazy initializers or functional updaters.
export function FunctionState(t0) {
  const $ = _c(8);
  const { initial, next, observe } = t0;
  const t1 = initial;
  let t2;
  if ($[0] !== t1) {
    t2 = () => t1;
    $[0] = t1;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  const [value, setValue] = useState(t2);
  unstable_freezeState(value);
  let t3;
  if ($[2] !== next || $[3] !== observe) {
    t3 = () => {
      let currentValue;
      currentValue = next;
      const t4 = currentValue;
      setValue(() => t4);
      observe(currentValue);
    };
    $[2] = next;
    $[3] = observe;
    $[4] = t3;
  } else {
    t3 = $[4];
  }

  const t4 = typeof value;
  let t5;
  if ($[5] !== t3 || $[6] !== t4) {
    t5 = <button onClick={t3}>{t4}</button>;
    $[5] = t3;
    $[6] = t4;
    $[7] = t5;
  } else {
    t5 = $[7];
  }
  return t5;
}

export function InlineFunctionState() {
  const $ = _c(6);
  const t0 = _temp;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => t0;
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const [value, setValue2] = useState(t1);
  unstable_freezeState(value);
  let t2;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = () => {
      const t3 = _temp2;
      setValue2(() => t3);
    };
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  let t3;
  if ($[2] !== value) {
    t3 = value();
    $[2] = value;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  let t4;
  if ($[4] !== t3) {
    t4 = <button onClick={t2}>{t3}</button>;
    $[4] = t3;
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  return t4;
}
function _temp2() {
  return "next";
}
function _temp() {
  return "initial";
}

```
