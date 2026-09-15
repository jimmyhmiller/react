
## Input

```javascript
// @enableContextSelectors
// A comparison operand is only moved into the description if it has the same
// value when the context is read: a value computed after the read (here, from
// a local that is mutated) or read from a mutable local selects the compared
// value itself instead.
import {createContext, useContext} from 'react';

const Selection = createContext(null);

function Row({row}) {
  const selection = useContext(Selection);
  const local = {id: row.id};
  local.id = local.id + 1;
  const matchesNext = selection.current === local.id;
  const matchesRow = selection.previous === row.id;
  return (
    <tr>
      <td>{matchesNext ? 'next' : ''}</td>
      <td>{matchesRow ? 'previous' : ''}</td>
    </tr>
  );
}

```

## Code

```javascript
import { c as _c, unstable_useContextPaths } from "react/compiler-runtime"; // @enableContextSelectors
// A comparison operand is only moved into the description if it has the same
// value when the context is read: a value computed after the read (here, from
// a local that is mutated) or read from a mutable local selects the compared
// value itself instead.
import { createContext, useContext } from "react";

const Selection = createContext(null);

function Row(t0) {
  const $ = _c(12);
  const { row } = t0;
  let t1;
  if ($[0] !== row.id) {
    t1 = [1, row.id, "previous"];
    $[0] = row.id;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = [0, "current"];
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== t1) {
    t3 = [t1, t2];
    $[3] = t1;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  const selection = unstable_useContextPaths(Selection, t3);
  const local = { id: row.id };
  local.id = local.id + 1;
  const matchesNext = selection.current === local.id;
  const matchesRow = selection.previous === row.id;

  const t4 = matchesNext ? "next" : "";
  let t5;
  if ($[5] !== t4) {
    t5 = <td>{t4}</td>;
    $[5] = t4;
    $[6] = t5;
  } else {
    t5 = $[6];
  }
  const t6 = matchesRow ? "previous" : "";
  let t7;
  if ($[7] !== t6) {
    t7 = <td>{t6}</td>;
    $[7] = t6;
    $[8] = t7;
  } else {
    t7 = $[8];
  }
  let t8;
  if ($[9] !== t5 || $[10] !== t7) {
    t8 = (
      <tr>
        {t5}
        {t7}
      </tr>
    );
    $[9] = t5;
    $[10] = t7;
    $[11] = t8;
  } else {
    t8 = $[11];
  }
  return t8;
}

```
      