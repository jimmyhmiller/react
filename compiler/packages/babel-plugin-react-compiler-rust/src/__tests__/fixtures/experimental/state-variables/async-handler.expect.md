
## Input

```javascript
// @enableStateVariables
// An async function continues after the render that called it.
function Loader({load}) {
  let data = null;
  let loading = false;
  async function onLoad() {
    loading = true;
    data = await load();
    loading = false;
  }
  return <button onClick={onLoad}>{loading ? '...' : data}</button>;
}

```

## Code

```javascript
import { useState } from "react";
import { c as _c, unstable_freezeState } from "react/compiler-runtime"; // @enableStateVariables
// An async function continues after the render that called it.
function Loader(t0) {
  const $ = _c(5);
  const { load } = t0;
  const [data, setData] = useState(null);
  unstable_freezeState(data);
  const [loading, setLoading] = useState(false);
  unstable_freezeState(loading);
  let t1;
  if ($[0] !== load) {
    t1 = async function onLoad() {
      setLoading(true);
      setData(await load());
      setLoading(false);
    };
    $[0] = load;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const onLoad = t1;

  const t2 = loading ? "..." : data;
  let t3;
  if ($[2] !== onLoad || $[3] !== t2) {
    t3 = <button onClick={onLoad}>{t2}</button>;
    $[2] = onLoad;
    $[3] = t2;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  return t3;
}

```
