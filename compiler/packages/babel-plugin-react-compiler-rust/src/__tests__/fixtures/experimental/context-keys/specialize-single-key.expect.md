
## Input

```javascript
// @enableContextSelectors @enableContextKeySpecialization @compilationMode:"infer"
import {createContext, useContext} from 'react';
const Context = createContext(null);
export function useRecord(id) {
  return useContext(Context)[id];
}
export function StaticKey() {
  return <span>{useContext(Context).label}</span>;
}
export function NumberKey() {
  return <span>{useContext(Context)[0]}</span>;
}

```

## Code

```javascript
import { c as _c, unstable_useContextKey } from "react/compiler-runtime"; // @enableContextSelectors @enableContextKeySpecialization @compilationMode:"infer"
import { createContext, useContext } from "react";
const Context = createContext(null);
export function useRecord(id) {
  return unstable_useContextKey(Context, id)[id];
}

export function StaticKey() {
  const $ = _c(2);
  const t0 = unstable_useContextKey(Context, "label");
  let t1;
  if ($[0] !== t0.label) {
    t1 = <span>{t0.label}</span>;
    $[0] = t0.label;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

export function NumberKey() {
  const $ = _c(2);
  const t0 = unstable_useContextKey(Context, 0);
  let t1;
  if ($[0] !== t0[0]) {
    t1 = <span>{t0[0]}</span>;
    $[0] = t0[0];
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

```
      