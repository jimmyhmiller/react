
## Input

```javascript
// @enableContextSelectors
// None of these hooks is registered: one returns a value derived from the
// context, one calls another hook, and one reads two contexts. Calls of them
// are still selected, but React only applies the description to registered
// hooks.
import {createContext, useContext, useState} from 'react';

const A = createContext(null);
const B = createContext(null);

export function useDerived() {
  const value = useContext(A);
  return value.enabled ? value : {enabled: false};
}

export function useWithState() {
  useState(0);
  return useContext(A);
}

export function useTwoContexts() {
  useContext(B);
  return useContext(A);
}

export function Consumer() {
  const derived = useDerived();
  const withState = useWithState();
  const two = useTwoContexts();
  return (
    <p>
      {derived.label}
      {withState.label}
      {two.label}
    </p>
  );
}

```

## Code

```javascript
import {
  c as _c,
  unstable_selectHookPaths,
  unstable_startSelectedHook,
  unstable_useContextPaths,
} from "react/compiler-runtime"; // @enableContextSelectors
// None of these hooks is registered: one returns a value derived from the
// context, one calls another hook, and one reads two contexts. Calls of them
// are still selected, but React only applies the description to registered
// hooks.
import { createContext, useContext, useState } from "react";

const A = createContext(null);
const B = createContext(null);

export function useDerived() {
  const $ = _c(2);
  const value = useContext(A);
  let t0;
  if ($[0] !== value) {
    t0 = value.enabled ? value : { enabled: false };
    $[0] = value;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  return t0;
}

export function useWithState() {
  useState(0);
  return useContext(A);
}

export function useTwoContexts() {
  const $ = _c(1);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  unstable_useContextPaths(B, t0);
  return useContext(A);
}

export function Consumer() {
  const $ = _c(7);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [[0, "label"]];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const _selectedHook = unstable_startSelectedHook(useDerived);
  const t1 = useDerived();
  unstable_selectHookPaths(_selectedHook, t1, useDerived, t0);
  const derived = t1;
  let t2;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = [[0, "label"]];
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  const _selectedHook2 = unstable_startSelectedHook(useWithState);
  const t3 = useWithState();
  unstable_selectHookPaths(_selectedHook2, t3, useWithState, t2);
  const withState = t3;
  let t4;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    t4 = [[0, "label"]];
    $[2] = t4;
  } else {
    t4 = $[2];
  }
  const _selectedHook3 = unstable_startSelectedHook(useTwoContexts);
  const t5 = useTwoContexts();
  unstable_selectHookPaths(_selectedHook3, t5, useTwoContexts, t4);
  const two = t5;
  let t6;
  if (
    $[3] !== derived.label ||
    $[4] !== two.label ||
    $[5] !== withState.label
  ) {
    t6 = (
      <p>
        {derived.label}
        {withState.label}
        {two.label}
      </p>
    );
    $[3] = derived.label;
    $[4] = two.label;
    $[5] = withState.label;
    $[6] = t6;
  } else {
    t6 = $[6];
  }
  return t6;
}

```
      