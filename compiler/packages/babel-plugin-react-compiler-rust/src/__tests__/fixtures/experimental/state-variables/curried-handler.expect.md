
## Input

```javascript
// @enableStateVariables
// A function that returns a handler is called during render; the handler that
// it returns runs after render.
function Tabs() {
  let selected = null;
  const select = id => () => {
    selected = id;
  };
  return (
    <>
      <button onClick={select(1)}>one</button>
      <button onClick={select(2)}>two</button>
      {selected}
    </>
  );
}

```

## Code

```javascript
import { useState } from "react";
import { c as _c, unstable_freezeState } from "react/compiler-runtime"; // @enableStateVariables
// A function that returns a handler is called during render; the handler that
// it returns runs after render.
function Tabs() {
  const $ = _c(5);
  const [selected, setSelected] = useState(null);
  unstable_freezeState(selected);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = (id) => () => {
      const t1 = id;
      setSelected(() => t1);
    };
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const select = t0;
  let t1;
  let t2;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = <button onClick={select(1)}>one</button>;
    t2 = <button onClick={select(2)}>two</button>;
    $[1] = t1;
    $[2] = t2;
  } else {
    t1 = $[1];
    t2 = $[2];
  }
  let t3;
  if ($[3] !== selected) {
    t3 = (
      <>
        {t1}
        {t2}
        {selected}
      </>
    );
    $[3] = selected;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  return t3;
}

```
