
## Input

```javascript
// @enableComponentInlining
import {useRef} from 'react';

function Label({text}) {
  return <span>{text}</span>;
}

function App(props) {
  const ref = useRef(null);
  return (
    <div>
      <Label {...props} />
      <Label text="b" ref={ref} />
    </div>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{text: 'a'}],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableComponentInlining
import { useRef } from "react";

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

function App(props) {
  const $ = _c(5);
  const ref = useRef(null);
  let t0;
  if ($[0] !== props) {
    t0 = <Label {...props} />;
    $[0] = props;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  let t1;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = <Label text="b" ref={ref} />;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[3] !== t0) {
    t2 = (
      <div>
        {t0}
        {t1}
      </div>
    );
    $[3] = t0;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  return t2;
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{ text: "a" }],
};

```
      
### Eval output
(kind: ok) <div><span>a</span><span>b</span></div>