
## Input

```javascript
// @enableStateVariables @flow
// A mutation that is part of an expression whose value nothing uses, and a
// path through a type cast.
function Selection({id, enabled}) {
  let selected = new Set();
  let draft = {};
  return (
    <>
      <button onClick={() => { selected.has(id) ? selected.delete(id) : selected.add(id); }}>toggle</button>
      <button onClick={() => { enabled && selected.clear(); }}>clear</button>
      <button onClick={() => { (draft: any).title = id; }}>title</button>
      {selected.size} {draft.title}
    </>
  );
}

```

## Code

```javascript
import { useState } from "react";
import {
  c as _c,
  unstable_copyForUpdate,
  unstable_freezeState,
} from "react/compiler-runtime";

function Selection(t0) {
  const $ = _c(15);
  const { id, enabled } = t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = new Set();
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const [selected, setSelected] = useState(t1);
  unstable_freezeState(selected);
  let t2;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = {};
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  const [draft, setDraft] = useState(t2);
  unstable_freezeState(draft);
  let t3;
  if ($[2] !== id || $[3] !== selected) {
    t3 = (
      <button
        onClick={() => {
          selected.has(id)
            ? setSelected((selected$0) => {
                const t4 = unstable_copyForUpdate(selected$0);
                t4.delete(id);
                return t4;
              })
            : setSelected((selected$1) => {
                const t5 = unstable_copyForUpdate(selected$1);
                t5.add(id);
                return t5;
              });
        }}
      >
        toggle
      </button>
    );
    $[2] = id;
    $[3] = selected;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  let t4;
  if ($[5] !== enabled) {
    t4 = (
      <button
        onClick={() => {
          enabled && setSelected(_temp);
        }}
      >
        clear
      </button>
    );
    $[5] = enabled;
    $[6] = t4;
  } else {
    t4 = $[6];
  }
  let t5;
  if ($[7] !== id) {
    t5 = (
      <button
        onClick={() => {
          setDraft((draft$0) => {
            const t6 = unstable_copyForUpdate(draft$0);
            t6.title = id;
            return t6;
          });
        }}
      >
        title
      </button>
    );
    $[7] = id;
    $[8] = t5;
  } else {
    t5 = $[8];
  }
  let t6;
  if (
    $[9] !== draft.title ||
    $[10] !== selected.size ||
    $[11] !== t3 ||
    $[12] !== t4 ||
    $[13] !== t5
  ) {
    t6 = (
      <>
        {t3}
        {t4}
        {t5}
        {selected.size} {draft.title}
      </>
    );
    $[9] = draft.title;
    $[10] = selected.size;
    $[11] = t3;
    $[12] = t4;
    $[13] = t5;
    $[14] = t6;
  } else {
    t6 = $[14];
  }
  return t6;
}
function _temp(selected) {
  const t0 = unstable_copyForUpdate(selected);
  t0.clear();
  return t0;
}

```
