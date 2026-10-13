
## Input

```javascript
// @enableStateVariables
// A read that follows a mutation reads the updated value: the handler applies
// the same updater to its own copy of the state.
function Stack() {
  let stack = [1, 2, 3];
  return (
    <button
      onClick={() => {
        stack.push(stack.length + 1);
        console.log(stack.length);
      }}>
      {stack.join(',')}
    </button>
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
// A read that follows a mutation reads the updated value: the handler applies
// the same updater to its own copy of the state.
function Stack() {
  const $ = _c(7);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [1, 2, 3];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const [stack, setStack] = useState(t0);
  unstable_freezeState(stack);
  let t1;
  let t2;
  if ($[1] !== stack) {
    t1 = () => {
      let currentStack = stack;
      const t3 = currentStack.length + 1;
      const t5 = (stack$0) => {
        const t4 = unstable_copyForUpdate(stack$0);
        t4.push(t3);
        return t4;
      };
      currentStack = t5(currentStack);
      setStack(t5);
      console.log(currentStack.length);
    };
    t2 = stack.join(",");
    $[1] = stack;
    $[2] = t1;
    $[3] = t2;
  } else {
    t1 = $[2];
    t2 = $[3];
  }
  let t3;
  if ($[4] !== t1 || $[5] !== t2) {
    t3 = <button onClick={t1}>{t2}</button>;
    $[4] = t1;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  return t3;
}

```
