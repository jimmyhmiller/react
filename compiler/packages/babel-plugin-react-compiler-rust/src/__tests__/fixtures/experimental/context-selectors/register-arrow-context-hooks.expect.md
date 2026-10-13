
## Input

```javascript
// @enableContextSelectors @compilationMode:"infer"
// Context hooks written as arrow functions are registered by the `const` they
// initialize, whether they call `useContext` or `React.useContext`. An arrow
// function that is not the initializer of a top-level `const` has no binding
// to register.
import React, {createContext, useContext} from 'react';

const BoardContext = createContext(null);

export const useBoard = () => useContext(BoardContext);

export const useBoardFromReact = () => React.useContext(BoardContext);

export const hooks = {
  useNested: () => useContext(BoardContext),
};

export function Title({id}) {
  const board = useBoard();
  const other = useBoardFromReact();
  return (
    <h2>
      {board.titles[id]}
      {other.subtitle}
    </h2>
  );
}

```

## Code

```javascript
import {
  c as _c,
  unstable_registerContextHook,
  unstable_selectHookPaths,
  unstable_startSelectedHook,
} from "react/compiler-runtime"; // @enableContextSelectors @compilationMode:"infer"
// Context hooks written as arrow functions are registered by the `const` they
// initialize, whether they call `useContext` or `React.useContext`. An arrow
// function that is not the initializer of a top-level `const` has no binding
// to register.
import React, { createContext, useContext } from "react";

const BoardContext = createContext(null);

export const useBoard = () => {
  return useContext(BoardContext);
};
unstable_registerContextHook(useBoard);

export const useBoardFromReact = () => {
  return React.useContext(BoardContext);
};
unstable_registerContextHook(useBoardFromReact);

export const hooks = {
  useNested: () => useContext(BoardContext),
};

export function Title(t0) {
  const $ = _c(6);
  const { id } = t0;
  let t1;
  if ($[0] !== id) {
    t1 = [[0, "titles", id]];
    $[0] = id;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const _selectedHook = unstable_startSelectedHook(useBoard);
  const t2 = useBoard();
  unstable_selectHookPaths(_selectedHook, t2, useBoard, t1);
  const board = t2;
  let t3;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    t3 = [[0, "subtitle"]];
    $[2] = t3;
  } else {
    t3 = $[2];
  }
  const _selectedHook2 = unstable_startSelectedHook(useBoardFromReact);
  const t4 = useBoardFromReact();
  unstable_selectHookPaths(_selectedHook2, t4, useBoardFromReact, t3);
  const other = t4;

  const t5 = board.titles[id];
  let t6;
  if ($[3] !== other.subtitle || $[4] !== t5) {
    t6 = (
      <h2>
        {t5}
        {other.subtitle}
      </h2>
    );
    $[3] = other.subtitle;
    $[4] = t5;
    $[5] = t6;
  } else {
    t6 = $[5];
  }
  return t6;
}

```
