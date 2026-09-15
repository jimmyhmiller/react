
## Input

```javascript
// @enableComponentInlining
// Inside `cond && <Greeting />` the inlined body could not declare `name`
// (value blocks only contain expressions), so the site is not inlined.
function Greeting({name = 'world'}) {
  return <b>{name}</b>;
}

function App({cond}) {
  return <div>{cond > 0 && <Greeting />}</div>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{cond: 1}],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableComponentInlining
// Inside `cond && <Greeting />` the inlined body could not declare `name`
// (value blocks only contain expressions), so the site is not inlined.
function Greeting(t0) {
  const $ = _c(2);
  const { name: t1 } = t0;
  const name = t1 === undefined ? "world" : t1;
  let t2;
  if ($[0] !== name) {
    t2 = <b>{name}</b>;
    $[0] = name;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  return t2;
}

function App(t0) {
  const $ = _c(4);
  const { cond } = t0;
  let t1;
  if ($[0] !== cond) {
    t1 = cond > 0 && <Greeting />;
    $[0] = cond;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== t1) {
    t2 = <div>{t1}</div>;
    $[2] = t1;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  return t2;
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{ cond: 1 }],
};

```
      
### Eval output
(kind: ok) <div><b>world</b></div>