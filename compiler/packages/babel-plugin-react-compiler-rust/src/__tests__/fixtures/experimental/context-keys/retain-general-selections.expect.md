
## Input

```javascript
// @enableContextSelectors @enableContextKeySpecialization @compilationMode:"infer"
import {createContext, useContext} from 'react';
const Context = createContext(null);
export function NestedPath() {
  return <span>{useContext(Context).user.name}</span>;
}
export function MultipleKeys() {
  const value = useContext(Context);
  return <span>{value.first}{value.last}</span>;
}
export function Equality({id}) {
  return <span>{useContext(Context).selectedId === id}</span>;
}
export function WholeValue() {
  const value = useContext(Context);
  return <Consumer value={value} />;
}

```

## Code

```javascript
import { c as _c, unstable_useContextPaths } from "react/compiler-runtime"; // @enableContextSelectors @enableContextKeySpecialization @compilationMode:"infer"
import { createContext, useContext } from "react";
const Context = createContext(null);
export function NestedPath() {
  const $ = _c(3);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [[0, "user", "name"]];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const t1 = unstable_useContextPaths(Context, t0);
  let t2;
  if ($[1] !== t1.user.name) {
    t2 = <span>{t1.user.name}</span>;
    $[1] = t1.user.name;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  return t2;
}

export function MultipleKeys() {
  const $ = _c(4);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [
      [0, "last"],
      [0, "first"],
    ];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const value = unstable_useContextPaths(Context, t0);
  let t1;
  if ($[1] !== value.first || $[2] !== value.last) {
    t1 = (
      <span>
        {value.first}
        {value.last}
      </span>
    );
    $[1] = value.first;
    $[2] = value.last;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  return t1;
}

export function Equality(t0) {
  const $ = _c(4);
  const { id } = t0;
  let t1;
  if ($[0] !== id) {
    t1 = [[1, id, "selectedId"]];
    $[0] = id;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const t2 = unstable_useContextPaths(Context, t1).selectedId === id;
  let t3;
  if ($[2] !== t2) {
    t3 = <span>{t2}</span>;
    $[2] = t2;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  return t3;
}

export function WholeValue() {
  const $ = _c(2);
  const value = useContext(Context);
  let t0;
  if ($[0] !== value) {
    t0 = <Consumer value={value} />;
    $[0] = value;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  return t0;
}

```
      