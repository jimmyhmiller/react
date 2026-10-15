
## Input

```javascript
// @enableStateVariables
// A destructuring assignment writes each variable. `c` has no initial value.
function Swap() {
  let a = 1,
    b = 2,
    c;
  return (
    <button
      onClick={() => {
        [a, b] = [b, a];
        c = a;
      }}>
      {a}
      {b}
      {c}
    </button>
  );
}

```

## Code

```javascript
import { useState } from "react";
import { c as _c, unstable_freezeState } from "react/compiler-runtime"; // @enableStateVariables
// A destructuring assignment writes each variable. `c` has no initial value.
function Swap() {
  const $ = _c(8);
  const [a, setA] = useState(1);
  unstable_freezeState(a);
  const [b, setB] = useState(2);
  unstable_freezeState(b);
  const [c, setC] = useState();
  unstable_freezeState(c);
  let t0;
  if ($[0] !== a || $[1] !== b) {
    t0 = () => {
      let currentA = a;
      const [t1, t2] = [b, currentA];
      currentA = t1;
      const t3 = currentA;
      setA(() => t3);
      const t4 = t2;
      setB(() => t4);
      const t5 = currentA;
      setC(() => t5);
    };
    $[0] = a;
    $[1] = b;
    $[2] = t0;
  } else {
    t0 = $[2];
  }
  let t1;
  if ($[3] !== a || $[4] !== b || $[5] !== c || $[6] !== t0) {
    t1 = (
      <button onClick={t0}>
        {a}
        {b}
        {c}
      </button>
    );
    $[3] = a;
    $[4] = b;
    $[5] = c;
    $[6] = t0;
    $[7] = t1;
  } else {
    t1 = $[7];
  }
  return t1;
}

```
