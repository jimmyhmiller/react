
## Input

```javascript
// @enableStateVariables
// A `let` that a function reassigns after render is state. The handler only
// writes `count`, so it does not depend on it.
function Counter() {
  let count = 0;
  return <button onClick={() => count++}>{count}</button>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Counter,
  params: [{}],
};

```

## Code

```javascript
import { useState } from "react";
import { c as _c, unstable_freezeState } from "react/compiler-runtime"; // @enableStateVariables
// A `let` that a function reassigns after render is state. The handler only
// writes `count`, so it does not depend on it.
function Counter() {
  const $ = _c(3);
  const [count, setCount] = useState(0);
  unstable_freezeState(count);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = () => {
      setCount(_temp);
    };
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  let t1;
  if ($[1] !== count) {
    t1 = <button onClick={t0}>{count}</button>;
    $[1] = count;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  return t1;
}
function _temp(count) {
  return count + 1;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Counter,
  params: [{}],
};

```
