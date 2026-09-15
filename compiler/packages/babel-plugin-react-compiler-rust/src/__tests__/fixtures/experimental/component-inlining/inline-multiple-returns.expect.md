
## Input

```javascript
// @enableComponentInlining
function Status({state}) {
  if (state === 'loading') {
    return <em>loading</em>;
  }
  if (state === 'empty') {
    return null;
  }
  return <b>{state}</b>;
}

function Panel(props) {
  return (
    <div>
      <Status state={props.state} />
    </div>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: Panel,
  params: [{state: 'loading'}],
  sequentialRenders: [
    {state: 'loading'},
    {state: 'empty'},
    {state: 'ready'},
    {state: 'loading'},
  ],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableComponentInlining
function Status(t0) {
  const $ = _c(3);
  const { state } = t0;
  if (state === "loading") {
    let t1;
    if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
      t1 = <em>loading</em>;
      $[0] = t1;
    } else {
      t1 = $[0];
    }
    return t1;
  }

  if (state === "empty") {
    return null;
  }
  let t1;
  if ($[1] !== state) {
    t1 = <b>{state}</b>;
    $[1] = state;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  return t1;
}

function Panel(props) {
  const $ = _c(5);
  let t0;
  bb0: {
    const state = props.state;
    if (state === "loading") {
      let t1;
      if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
        t1 = <em>loading</em>;
        $[0] = t1;
      } else {
        t1 = $[0];
      }
      t0 = t1;
      break bb0;
    }
    if (state === "empty") {
      t0 = null;
      break bb0;
    }
    let t1;
    if ($[1] !== state) {
      t1 = <b>{state}</b>;
      $[1] = state;
      $[2] = t1;
    } else {
      t1 = $[2];
    }
    t0 = t1;
  }
  let t1;
  if ($[3] !== t0) {
    t1 = <div>{t0}</div>;
    $[3] = t0;
    $[4] = t1;
  } else {
    t1 = $[4];
  }
  return t1;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Panel,
  params: [{ state: "loading" }],
  sequentialRenders: [
    { state: "loading" },
    { state: "empty" },
    { state: "ready" },
    { state: "loading" },
  ],
};

```
      
### Eval output
(kind: ok) <div><em>loading</em></div>
<div></div>
<div><b>ready</b></div>
<div><em>loading</em></div>