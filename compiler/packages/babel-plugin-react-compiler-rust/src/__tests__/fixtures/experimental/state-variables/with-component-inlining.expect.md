
## Input

```javascript
// @enableStateVariables @enableComponentInlining
// A component with a state variable calls `useState` once compiled, so it is
// not inlined (rule C3 of component inlining). `Label` still is.
function Label({text}) {
  return <span>{text}</span>;
}

function Toggle({text}) {
  let open = false;
  return (
    <button onClick={() => { open = !open; }}>
      {text}
      {open ? '!' : ''}
    </button>
  );
}

function App({text}) {
  return (
    <div>
      <Label text={text} />
      <Toggle text={text} />
    </div>
  );
}

```

## Code

```javascript
import { useState } from "react";
import { c as _c, unstable_freezeState } from "react/compiler-runtime"; // @enableStateVariables @enableComponentInlining
// A component with a state variable calls `useState` once compiled, so it is
// not inlined (rule C3 of component inlining). `Label` still is.
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

function Toggle(t0) {
  const $ = _c(4);
  const { text } = t0;
  const [open, setOpen] = useState(false);
  unstable_freezeState(open);
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => {
      setOpen(_temp);
    };
    $[0] = t1;
  } else {
    t1 = $[0];
  }

  const t2 = open ? "!" : "";
  let t3;
  if ($[1] !== t2 || $[2] !== text) {
    t3 = (
      <button onClick={t1}>
        {text}
        {t2}
      </button>
    );
    $[1] = t2;
    $[2] = text;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  return t3;
}
function _temp(open) {
  return !open;
}

function App(t0) {
  const $ = _c(7);
  const { text } = t0;

  const text$0 = text;
  let t1;
  if ($[0] !== text$0) {
    t1 = <span>{text$0}</span>;
    $[0] = text$0;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const t2 = t1;
  let t3;
  if ($[2] !== text) {
    t3 = <Toggle text={text} />;
    $[2] = text;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  let t4;
  if ($[4] !== t2 || $[5] !== t3) {
    t4 = (
      <div>
        {t2}
        {t3}
      </div>
    );
    $[4] = t2;
    $[5] = t3;
    $[6] = t4;
  } else {
    t4 = $[6];
  }
  return t4;
}

```
