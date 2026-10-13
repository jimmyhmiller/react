
## Input

```javascript
// @enableStateVariables
// A function named like a hook whose nested function reassigns its variable is
// a hook, although it calls no hook: it calls `useState` once compiled.
function useToggle(initial) {
  let on = initial;
  return [on, () => { on = !on; }];
}

function Toggle() {
  const [on, toggle] = useToggle(false);
  return <button onClick={toggle}>{on ? 'on' : 'off'}</button>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Toggle,
  params: [{}],
};

```

## Code

```javascript
import { useState } from "react";
import { c as _c, unstable_freezeState } from "react/compiler-runtime"; // @enableStateVariables
// A function named like a hook whose nested function reassigns its variable is
// a hook, although it calls no hook: it calls `useState` once compiled.
function useToggle(initial) {
  const $ = _c(3);
  const [on, setOn] = useState(initial);
  unstable_freezeState(on);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = () => {
      setOn(_temp);
    };
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  let t1;
  if ($[1] !== on) {
    t1 = [on, t0];
    $[1] = on;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  return t1;
}
function _temp(on) {
  return !on;
}

function Toggle() {
  const $ = _c(3);
  const [on, toggle] = useToggle(false);
  const t0 = on ? "on" : "off";
  let t1;
  if ($[0] !== t0 || $[1] !== toggle) {
    t1 = <button onClick={toggle}>{t0}</button>;
    $[0] = t0;
    $[1] = toggle;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  return t1;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Toggle,
  params: [{}],
};

```
