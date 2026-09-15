
## Input

```javascript
// @enableJsxBlocks @enableListItemMemoization
// `selectedId` is rendered as well as compared, `loose` is compared with `==`,
// and `a` and `b` are compared with each other: none of them is a selection.
function List({items, selectedId, loose, a, b}) {
  return (
    <ul>
      {items.map(item => (
        <li
          key={item.id}
          className={item.id === selectedId ? 'selected' : ''}
          title={item.id == loose ? 'loose' : ''}>
          <b>{selectedId}</b>
          <i>{a === b ? item.label : ''}</i>
        </li>
      ))}
    </ul>
  );
}

```

## Code

```javascript
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import {
  c as _c,
  unstable_useListItemMemoCache as useListItemMemoCache,
} from "react/compiler-runtime";
const _BlockTemplate = _createBlockTemplate(["ul", null, null, [{ s: 0 }]]);
const _BlockTemplate2 = _createBlockTemplate([
  "li",
  null,
  [
    ["className", 0],
    ["title", 1],
  ],
  [
    ["b", null, null, [{ s: 2 }]],
    ["i", null, null, [{ s: 3 }]],
  ],
]); // @enableJsxBlocks @enableListItemMemoization
// `selectedId` is rendered as well as compared, `loose` is compared with `==`,
// and `a` and `b` are compared with each other: none of them is a selection.
function List(t0) {
  const $ = _c(15);
  const _listItemCache = useListItemMemoCache();
  const { items, selectedId, loose, a, b } = t0;
  let t1;
  if (
    $[0] !== a ||
    $[1] !== b ||
    $[2] !== items ||
    $[3] !== loose ||
    $[4] !== selectedId
  ) {
    let t2;
    if ($[6] !== a || $[7] !== b || $[8] !== loose || $[9] !== selectedId) {
      t2 = (item) => {
        const t4 = item.id;
        const t5 = item.id === selectedId ? "selected" : "";
        const t6 = item.id == loose ? "loose" : "";

        const t7 = a === b ? item.label : "";
        const $0 = _listItemCache.next(6, t4);
        let t8;
        if (
          $0[0] !== selectedId ||
          $0[1] !== t4 ||
          $0[2] !== t5 ||
          $0[3] !== t6 ||
          $0[4] !== t7
        ) {
          t8 = <_BlockTemplate2 key={t4} v={[t5, t6, selectedId, t7]} />;
          $0[0] = selectedId;
          $0[1] = t4;
          $0[2] = t5;
          $0[3] = t6;
          $0[4] = t7;
          $0[5] = t8;
        } else {
          t8 = $0[5];
        }
        return t8;
      };
      $[6] = a;
      $[7] = b;
      $[8] = loose;
      $[9] = selectedId;
      $[10] = t2;
    } else {
      t2 = $[10];
    }
    t1 = items.map(t2);
    $[0] = a;
    $[1] = b;
    $[2] = items;
    $[3] = loose;
    $[4] = selectedId;
    $[5] = t1;
  } else {
    t1 = $[5];
  }
  let t2;
  if ($[11] !== t1) {
    t2 = [t1];
    $[11] = t1;
    $[12] = t2;
  } else {
    t2 = $[12];
  }
  let t3;
  if ($[13] !== t2) {
    t3 = <_BlockTemplate v={t2} />;
    $[13] = t2;
    $[14] = t3;
  } else {
    t3 = $[14];
  }
  return t3;
}

```
      