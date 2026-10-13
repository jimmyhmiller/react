
## Input

```javascript
// @enableStateVariables
// A read that follows a write reads what was written: the handler gets a local
// copy of the state, which it reads and writes as plain JavaScript would.
function Counter({step}) {
  let count = 0;
  return (
    <button
      onClick={() => {
        count++;
        count += step;
        console.log(count);
      }}>
      {count}
    </button>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: Counter,
  params: [{step: 2}],
};

```

## Code

```javascript
import { useState } from "react";
import { c as _c, unstable_freezeState } from "react/compiler-runtime"; // @enableStateVariables
// A read that follows a write reads what was written: the handler gets a local
// copy of the state, which it reads and writes as plain JavaScript would.
function Counter(t0) {
  const $ = _c(6);
  const { step } = t0;
  const [count, setCount] = useState(0);
  unstable_freezeState(count);
  let t1;
  if ($[0] !== count || $[1] !== step) {
    t1 = () => {
      let currentCount = count;
      currentCount = currentCount + 1;
      setCount(_temp);
      currentCount = currentCount + step;
      setCount((count$0) => count$0 + step);
      console.log(currentCount);
    };
    $[0] = count;
    $[1] = step;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[3] !== count || $[4] !== t1) {
    t2 = <button onClick={t1}>{count}</button>;
    $[3] = count;
    $[4] = t1;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  return t2;
}
function _temp(count) {
  return count + 1;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Counter,
  params: [{ step: 2 }],
};

```
