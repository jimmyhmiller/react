
## Input

```javascript
// @enableComponentInlining
// Inspect can observe the element's type, so an element passed to a
// component that is not itself inlined must not be inlined.
import {useState} from 'react';

function Label({text}) {
  return <span>{text}</span>;
}

function Inspect({content}) {
  const [prefix] = useState('type:');
  return (
    <div>
      {prefix}
      {typeof content.type}
      {content}
    </div>
  );
}

function App() {
  return <Inspect content={<Label text="a" />} />;
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{}],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableComponentInlining
// Inspect can observe the element's type, so an element passed to a
// component that is not itself inlined must not be inlined.
import { useState } from "react";

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

function Inspect(t0) {
  const $ = _c(4);
  const { content } = t0;
  const [prefix] = useState("type:");

  const t1 = typeof content.type;
  let t2;
  if ($[0] !== content || $[1] !== prefix || $[2] !== t1) {
    t2 = (
      <div>
        {prefix}
        {t1}
        {content}
      </div>
    );
    $[0] = content;
    $[1] = prefix;
    $[2] = t1;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  return t2;
}

function App() {
  const $ = _c(1);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = <Inspect content={<Label text="a" />} />;
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
(kind: ok) <div>type:function<span>a</span></div>