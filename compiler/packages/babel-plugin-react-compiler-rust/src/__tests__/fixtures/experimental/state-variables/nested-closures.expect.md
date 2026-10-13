
## Input

```javascript
// @enableStateVariables
// The functions nested in a handler share its copy of the state, whether they
// are called by the handler (`forEach`) or later (`setTimeout`).
function Cart({items}) {
  let total = 0;
  let log = [];
  return (
    <button
      onClick={() => {
        items.forEach(item => {
          total += item.price;
        });
        console.log(total);
        setTimeout(() => {
          total = 0;
          log = [...log, total];
        }, 1000);
      }}>
      {total} {log.length}
    </button>
  );
}

```

## Code

```javascript
import { useState } from "react";
import { c as _c, unstable_freezeState } from "react/compiler-runtime"; // @enableStateVariables
// The functions nested in a handler share its copy of the state, whether they
// are called by the handler (`forEach`) or later (`setTimeout`).
function Cart(t0) {
  const $ = _c(8);
  const { items } = t0;
  const [total, setTotal] = useState(0);
  unstable_freezeState(total);
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = [];
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const [log, setLog] = useState(t1);
  unstable_freezeState(log);
  let t2;
  if ($[1] !== items || $[2] !== total) {
    t2 = () => {
      let currentTotal = total;
      items.forEach((item) => {
        const t3 = item.price;
        currentTotal = currentTotal + t3;
        setTotal((total$0) => total$0 + t3);
      });
      console.log(currentTotal);
      setTimeout(() => {
        currentTotal = 0;
        setTotal(currentTotal);
        const t4 = currentTotal;
        setLog((log$0) => [...log$0, t4]);
      }, 1000);
    };
    $[1] = items;
    $[2] = total;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== log.length || $[5] !== t2 || $[6] !== total) {
    t3 = (
      <button onClick={t2}>
        {total} {log.length}
      </button>
    );
    $[4] = log.length;
    $[5] = t2;
    $[6] = total;
    $[7] = t3;
  } else {
    t3 = $[7];
  }
  return t3;
}

```
