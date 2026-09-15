
## Input

```javascript
// @enableComponentInlining
// The site key moves onto the element returned by the inlined component.
function Label({text}) {
  return <span>{text}</span>;
}

function App({first}) {
  return (
    <div>
      <Label key={first} text={first} />
      <b>static</b>
    </div>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{first: 'a'}],
  sequentialRenders: [{first: 'a'}, {first: 'b'}, {first: 'b'}],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableComponentInlining
// The site key moves onto the element returned by the inlined component.
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
  const $ = _c(6);
  const { first } = t0;

  const text = first;
  let t1;
  if ($[0] !== first || $[1] !== text) {
    t1 = <span key={first}>{text}</span>;
    $[0] = first;
    $[1] = text;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  const t2 = t1;
  let t3;
  if ($[3] === Symbol.for("react.memo_cache_sentinel")) {
    t3 = <b>static</b>;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  let t4;
  if ($[4] !== t2) {
    t4 = (
      <div>
        {t2}
        {t3}
      </div>
    );
    $[4] = t2;
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  return t4;
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{ first: "a" }],
  sequentialRenders: [{ first: "a" }, { first: "b" }, { first: "b" }],
};

```
      
### Eval output
(kind: ok) <div><span>a</span><b>static</b></div>
<div><span>b</span><b>static</b></div>
<div><span>b</span><b>static</b></div>