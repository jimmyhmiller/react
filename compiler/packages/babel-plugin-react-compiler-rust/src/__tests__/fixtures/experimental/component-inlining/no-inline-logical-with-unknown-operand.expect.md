
## Input

```javascript
// @enableComponentInlining
// `show && <Label />` evaluates to `show` when it is falsy, and `show` could be
// an element, so the position may hold different element types (rule S4).
function Label({text}) {
  return <span>{text}</span>;
}

function App({show}) {
  return <div>{show && <Label text="a" />}</div>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{show: true}],
  sequentialRenders: [{show: true}, {show: <span>b</span>}],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableComponentInlining
// `show && <Label />` evaluates to `show` when it is falsy, and `show` could be
// an element, so the position may hold different element types (rule S4).
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
  const $ = _c(4);
  const { show } = t0;
  let t1;
  if ($[0] !== show) {
    t1 = show && <Label text="a" />;
    $[0] = show;
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
  params: [{ show: true }],
  sequentialRenders: [{ show: true }, { show: <span>b</span> }],
};

```
      
### Eval output
(kind: ok) <div><span>a</span></div>
<div><span>a</span></div>