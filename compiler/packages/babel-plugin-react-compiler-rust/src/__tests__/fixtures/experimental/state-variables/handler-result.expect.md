
## Input

```javascript
// @enableStateVariables
// A component may use what a function prop returns, so the value of the
// assignment is kept: `onSwap` returns what it wrote, `onBump` the sum. (React
// ignores what the event handler of a host element returns, see counter.js.)
function Pair() {
  let a = 1;
  let b = 2;
  return (
    <Foo
      onSwap={() => {
        const t = a;
        a = b;
        b = t;
        return a;
      }}
      onBump={() => (a = a + b * 2)}
      onNext={() => a++}
      a={a}
      b={b}
    />
  );
}

```

## Code

```javascript
import { useState } from "react";
import { c as _c, unstable_freezeState } from "react/compiler-runtime"; // @enableStateVariables
// A component may use what a function prop returns, so the value of the
// assignment is kept: `onSwap` returns what it wrote, `onBump` the sum. (React
// ignores what the event handler of a host element returns, see counter.js.)
function Pair() {
  const $ = _c(12);
  const [a, setA] = useState(1);
  unstable_freezeState(a);
  const [b, setB] = useState(2);
  unstable_freezeState(b);
  let t0;
  let t1;
  if ($[0] !== a || $[1] !== b) {
    t0 = () => {
      let currentA = a;
      const t = currentA;
      currentA = b;
      setA(currentA);
      setB(t);
      return currentA;
    };
    t1 = () => {
      let currentA2 = a;
      const t2 = b * 2;
      currentA2 = currentA2 + t2;
      setA((a$0) => a$0 + t2);
      return currentA2;
    };
    $[0] = a;
    $[1] = b;
    $[2] = t0;
    $[3] = t1;
  } else {
    t0 = $[2];
    t1 = $[3];
  }
  let t2;
  if ($[4] !== a) {
    t2 = () => {
      setA(_temp);
      return a;
    };
    $[4] = a;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  let t3;
  if ($[6] !== a || $[7] !== b || $[8] !== t0 || $[9] !== t1 || $[10] !== t2) {
    t3 = <Foo onSwap={t0} onBump={t1} onNext={t2} a={a} b={b} />;
    $[6] = a;
    $[7] = b;
    $[8] = t0;
    $[9] = t1;
    $[10] = t2;
    $[11] = t3;
  } else {
    t3 = $[11];
  }
  return t3;
}
function _temp(a) {
  return a + 1;
}

```
