
## Input

```javascript
// @enableComponentInlining
import {useState} from 'react';

function Counter({initial}) {
  const [count] = useState(initial);
  return <span>{count}</span>;
}

function App() {
  return (
    <div>
      <Counter initial={1} />
    </div>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{}],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableComponentInlining
import { useState } from "react";

function Counter(t0) {
  const $ = _c(2);
  const { initial } = t0;
  const [count] = useState(initial);
  let t1;
  if ($[0] !== count) {
    t1 = <span>{count}</span>;
    $[0] = count;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

function App() {
  const $ = _c(1);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = (
      <div>
        <Counter initial={1} />
      </div>
    );
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  return t0;
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{}],
};

```
      
### Eval output
(kind: ok) <div><span>1</span></div>