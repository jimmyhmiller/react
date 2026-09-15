
## Input

```javascript
// @enableComponentInlining
function Count({n}) {
  return <strong>{n}</strong>;
}

function Summary({items}) {
  return <div>{items.length > 0 && <Count n={items.length} />}</div>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Summary,
  params: [{items: []}],
  sequentialRenders: [{items: []}, {items: [1]}, {items: [1, 2]}, {items: []}],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableComponentInlining
function Count(t0) {
  const $ = _c(2);
  const { n } = t0;
  let t1;
  if ($[0] !== n) {
    t1 = <strong>{n}</strong>;
    $[0] = n;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

function Summary(t0) {
  const $ = _c(4);
  const { items } = t0;
  let t1;
  if ($[0] !== items.length) {
    t1 = items.length > 0 && <strong>{items.length}</strong>;
    $[0] = items.length;
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
  fn: Summary,
  params: [{ items: [] }],
  sequentialRenders: [
    { items: [] },
    { items: [1] },
    { items: [1, 2] },
    { items: [] },
  ],
};

```
      
### Eval output
(kind: ok) <div></div>
<div><strong>1</strong></div>
<div><strong>2</strong></div>
<div></div>