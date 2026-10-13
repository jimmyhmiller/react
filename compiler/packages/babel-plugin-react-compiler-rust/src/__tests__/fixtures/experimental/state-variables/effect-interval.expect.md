
## Input

```javascript
// @enableStateVariables
import {useEffect} from 'react';

// The interval callback is created once. It updates the state with an updater,
// so it does not need the current value of `seconds`.
function Timer() {
  let seconds = 0;
  useEffect(() => {
    const id = setInterval(() => {
      seconds++;
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return <span>{seconds}</span>;
}

```

## Code

```javascript
import { c as _c, unstable_freezeState } from "react/compiler-runtime"; // @enableStateVariables
import { useEffect, useState } from "react";

// The interval callback is created once. It updates the state with an updater,
// so it does not need the current value of `seconds`.
function Timer() {
  const $ = _c(4);
  const [seconds, setSeconds] = useState(0);
  unstable_freezeState(seconds);
  let t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = () => {
      const id = setInterval(() => {
        setSeconds(_temp);
      }, 1000);
      return () => clearInterval(id);
    };
    t1 = [];
    $[0] = t0;
    $[1] = t1;
  } else {
    t0 = $[0];
    t1 = $[1];
  }
  useEffect(t0, t1);
  let t2;
  if ($[2] !== seconds) {
    t2 = <span>{seconds}</span>;
    $[2] = seconds;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  return t2;
}
function _temp(seconds) {
  return seconds + 1;
}

```
