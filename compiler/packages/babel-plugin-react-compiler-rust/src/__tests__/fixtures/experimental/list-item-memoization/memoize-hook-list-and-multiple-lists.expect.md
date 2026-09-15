
## Input

```javascript
// @enableJsxBlocks @enableListItemMemoization
// Each list gets its own cache; the hooks are called at the start of the
// component, before any other code.
import {useState} from 'react';

function Lists({left, right}) {
  const [selected, setSelected] = useState(null);
  return (
    <main>
      <ul>
        {left.map(item => (
          <li key={item.id} className={item.id === selected ? 'on' : ''}>
            <a onClick={() => setSelected(item.id)}>{item.label}</a>
          </li>
        ))}
      </ul>
      <ol>
        {right.map(item => (
          <li key={item.id}>
            <span>{`${item.label} (${item.count})`}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}

```

## Code

```javascript
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import {
  c as _c,
  unstable_useListItemMemoCache as useListItemMemoCache,
} from "react/compiler-runtime"; // @enableJsxBlocks @enableListItemMemoization
// Each list gets its own cache; the hooks are called at the start of the
// component, before any other code.
import { useState } from "react";
const _BlockTemplate = _createBlockTemplate([
  "main",
  null,
  null,
  [
    ["ul", null, null, [{ s: 0 }]],
    ["ol", null, null, [{ s: 1 }]],
  ],
]);
const _BlockTemplate2 = _createBlockTemplate([
  "li",
  null,
  [["className", 0]],
  [["a", null, [["onClick", 1]], [{ s: 2 }]]],
]);
const _BlockTemplate3 = _createBlockTemplate([
  "li",
  null,
  null,
  [["span", null, null, [{ t: 0 }]]],
]);

function Lists(t0) {
  const $ = _c(15);
  const _listItemCache2 = useListItemMemoCache();
  const _listItemCache = useListItemMemoCache();
  const { left, right } = t0;
  const [selected, setSelected] = useState(null);
  let t1;
  if ($[0] !== _listItemCache) {
    t1 = (item) => {
      const t6 = item.id;
      const t7 = _listItemCache.is(0, item.id) ? "on" : "";
      const t8 = item.label;
      const $0 = _listItemCache.next(6, t6);
      let t9;
      if (
        $0[0] !== item ||
        $0[1] !== setSelected ||
        $0[2] !== t6 ||
        $0[3] !== t7 ||
        $0[4] !== t8
      ) {
        t9 = (
          <_BlockTemplate2 key={t6} v={[t7, () => setSelected(item.id), t8]} />
        );
        $0[0] = item;
        $0[1] = setSelected;
        $0[2] = t6;
        $0[3] = t7;
        $0[4] = t8;
        $0[5] = t9;
      } else {
        t9 = $0[5];
      }
      return t9;
    };
    $[0] = _listItemCache;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if (
    $[2] !== _listItemCache ||
    $[3] !== left ||
    $[4] !== selected ||
    $[5] !== t1
  ) {
    t2 = _listItemCache.map(left, t1, [selected]);
    $[2] = _listItemCache;
    $[3] = left;
    $[4] = selected;
    $[5] = t1;
    $[6] = t2;
  } else {
    t2 = $[6];
  }
  let t3;
  if ($[7] !== right) {
    let t4;
    if ($[9] === Symbol.for("react.memo_cache_sentinel")) {
      t4 = (item_0) => {
        const t6 = item_0.id;
        const t7 = `${item_0.label} (${item_0.count})`;
        const $0 = _listItemCache2.next(3, t6);
        let t8;
        if ($0[0] !== t6 || $0[1] !== t7) {
          t8 = <_BlockTemplate3 key={t6} v={[t7]} />;
          $0[0] = t6;
          $0[1] = t7;
          $0[2] = t8;
        } else {
          t8 = $0[2];
        }
        return t8;
      };
      $[9] = t4;
    } else {
      t4 = $[9];
    }
    t3 = right.map(t4);
    $[7] = right;
    $[8] = t3;
  } else {
    t3 = $[8];
  }
  let t4;
  if ($[10] !== t2 || $[11] !== t3) {
    t4 = [t2, t3];
    $[10] = t2;
    $[11] = t3;
    $[12] = t4;
  } else {
    t4 = $[12];
  }
  let t5;
  if ($[13] !== t4) {
    t5 = <_BlockTemplate v={t4} />;
    $[13] = t4;
    $[14] = t5;
  } else {
    t5 = $[14];
  }
  return t5;
}

```
      