
## Input

```javascript
// @enableContextSelectors
// `useBoard` returns the value of its one context read (or throws), so the
// module registers it. The component's call is selected: React applies the
// description when the hook is registered and the call reads exactly that
// context.
import {createContext, useContext} from 'react';

const BoardContext = createContext(null);

export function useBoard() {
  const board = useContext(BoardContext);
  if (board === null) {
    throw new Error('useBoard must be used inside a BoardProvider');
  }
  return board;
}

export function Title({id}) {
  const board = useBoard();
  return <h2>{board.titles[id]}</h2>;
}

```

## Code

```javascript
import {
  c as _c,
  unstable_registerContextHook,
  unstable_selectHookPaths,
  unstable_startSelectedHook,
} from "react/compiler-runtime"; // @enableContextSelectors
// `useBoard` returns the value of its one context read (or throws), so the
// module registers it. The component's call is selected: React applies the
// description when the hook is registered and the call reads exactly that
// context.
import { createContext, useContext } from "react";

const BoardContext = createContext(null);

export function useBoard() {
  const board = useContext(BoardContext);
  if (board === null) {
    throw new Error("useBoard must be used inside a BoardProvider");
  }

  return board;
}
unstable_registerContextHook(useBoard);

export function Title(t0) {
  const $ = _c(4);
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
  const t3 = board.titles[id];
  let t4;
  if ($[2] !== t3) {
    t4 = <h2>{t3}</h2>;
    $[2] = t3;
    $[3] = t4;
  } else {
    t4 = $[3];
  }
  return t4;
}

```
      