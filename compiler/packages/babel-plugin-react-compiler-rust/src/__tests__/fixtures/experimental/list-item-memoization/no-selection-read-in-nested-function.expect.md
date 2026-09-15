
## Input

```javascript
// @enableJsxBlocks @enableListItemMemoization
// `selectedId` is compared inside an event handler, which runs after the render
// and must read the value of the render that created it, so it is not a
// selection. The list is still memoized per item.
function List({items, selectedId, onPick}) {
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>
          <b onClick={() => onPick(item.id === selectedId)}>{item.label}</b>
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
  null,
  [["b", null, [["onClick", 0]], [{ s: 1 }]]],
]); // @enableJsxBlocks @enableListItemMemoization
// `selectedId` is compared inside an event handler, which runs after the render
// and must read the value of the render that created it, so it is not a
// selection. The list is still memoized per item.
function List(t0) {
  const $ = _c(11);
  const _listItemCache = useListItemMemoCache();
  const { items, selectedId, onPick } = t0;
  let t1;
  if ($[0] !== items || $[1] !== onPick || $[2] !== selectedId) {
    let t2;
    if ($[4] !== onPick || $[5] !== selectedId) {
      t2 = (item) => {
        const t4 = item.id;
        const t5 = item.label;
        const $0 = _listItemCache.next(6, t4);
        let t6;
        if (
          $0[0] !== item ||
          $0[1] !== onPick ||
          $0[2] !== selectedId ||
          $0[3] !== t4 ||
          $0[4] !== t5
        ) {
          t6 = (
            <_BlockTemplate2
              key={t4}
              v={[() => onPick(item.id === selectedId), t5]}
            />
          );
          $0[0] = item;
          $0[1] = onPick;
          $0[2] = selectedId;
          $0[3] = t4;
          $0[4] = t5;
          $0[5] = t6;
        } else {
          t6 = $0[5];
        }
        return t6;
      };
      $[4] = onPick;
      $[5] = selectedId;
      $[6] = t2;
    } else {
      t2 = $[6];
    }
    t1 = items.map(t2);
    $[0] = items;
    $[1] = onPick;
    $[2] = selectedId;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  let t2;
  if ($[7] !== t1) {
    t2 = [t1];
    $[7] = t1;
    $[8] = t2;
  } else {
    t2 = $[8];
  }
  let t3;
  if ($[9] !== t2) {
    t3 = <_BlockTemplate v={t2} />;
    $[9] = t2;
    $[10] = t3;
  } else {
    t3 = $[10];
  }
  return t3;
}

```
      