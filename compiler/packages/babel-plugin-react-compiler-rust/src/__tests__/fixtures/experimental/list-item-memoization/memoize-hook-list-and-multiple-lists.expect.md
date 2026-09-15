
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
  const $ = _c(13);
  const _listItemCache = useListItemMemoCache();
  const _listItemCache2 = useListItemMemoCache();
  const { left, right } = t0;
  const [selected, setSelected] = useState(null);
  let t1;
  if ($[0] !== left || $[1] !== selected) {
    let t2;
    if ($[3] !== selected) {
      t2 = (item) => {
        const t5 = item.id;
        const t6 = item.id === selected ? "on" : "";
        const t7 = item.label;
        const $0 = _listItemCache.next(6, t5);
        let t8;
        if (
          $0[0] !== item ||
          $0[1] !== setSelected ||
          $0[2] !== t5 ||
          $0[3] !== t6 ||
          $0[4] !== t7
        ) {
          t8 = (
            <_BlockTemplate2
              key={t5}
              v={[t6, () => setSelected(item.id), t7]}
            />
          );
          $0[0] = item;
          $0[1] = setSelected;
          $0[2] = t5;
          $0[3] = t6;
          $0[4] = t7;
          $0[5] = t8;
        } else {
          t8 = $0[5];
        }
        return t8;
      };
      $[3] = selected;
      $[4] = t2;
    } else {
      t2 = $[4];
    }
    t1 = left.map(t2);
    $[0] = left;
    $[1] = selected;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[5] !== right) {
    let t3;
    if ($[7] === Symbol.for("react.memo_cache_sentinel")) {
      t3 = (item_0) => {
        const t5 = item_0.id;
        const t6 = `${item_0.label} (${item_0.count})`;
        const $0 = _listItemCache2.next(3, t5);
        let t7;
        if ($0[0] !== t5 || $0[1] !== t6) {
          t7 = <_BlockTemplate3 key={t5} v={[t6]} />;
          $0[0] = t5;
          $0[1] = t6;
          $0[2] = t7;
        } else {
          t7 = $0[2];
        }
        return t7;
      };
      $[7] = t3;
    } else {
      t3 = $[7];
    }
    t2 = right.map(t3);
    $[5] = right;
    $[6] = t2;
  } else {
    t2 = $[6];
  }
  let t3;
  if ($[8] !== t1 || $[9] !== t2) {
    t3 = [t1, t2];
    $[8] = t1;
    $[9] = t2;
    $[10] = t3;
  } else {
    t3 = $[10];
  }
  let t4;
  if ($[11] !== t3) {
    t4 = <_BlockTemplate v={t3} />;
    $[11] = t3;
    $[12] = t4;
  } else {
    t4 = $[12];
  }
  return t4;
}

```
      