
## Input

```javascript
// @enableComponentInlining
// `cond ? <Label/> : <span/>` would reuse the <span> DOM node after inlining
// instead of remounting, so this site must not be inlined.
function Label({text}) {
  return <span>{text}</span>;
}

function App({cond}) {
  return <div>{cond ? <Label text="a" /> : <span>b</span>}</div>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{cond: true}],
  sequentialRenders: [{cond: true}, {cond: false}],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableComponentInlining
// `cond ? <Label/> : <span/>` would reuse the <span> DOM node after inlining
// instead of remounting, so this site must not be inlined.
function Label(t0) {
  const $ = _c(2);
  const { text } = t0;
  let t1;
  if ($[0] !== text) {
    t1 = <span>{text}</span>;
    $[0] = text;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

function App(t0) {
  const $ = _c(2);
  const { cond } = t0;
  let t1;
  if ($[0] !== cond) {
    t1 = <div>{cond ? <Label text="a" /> : <span>b</span>}</div>;
    $[0] = cond;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{ cond: true }],
  sequentialRenders: [{ cond: true }, { cond: false }],
};

```
      
### Eval output
(kind: ok) <div><span>a</span></div>
<div><span>b</span></div>