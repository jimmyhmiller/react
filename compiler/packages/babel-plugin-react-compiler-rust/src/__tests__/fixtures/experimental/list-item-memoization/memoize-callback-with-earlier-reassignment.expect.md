
## Input

```javascript
// @enableJsxBlocks @enableListItemMemoization
// The callback reassigns a variable before it creates the element, so the
// element's allocations can move right before the return: the list is
// memoized per item, and the reassigned variable is a dependency.
function List({items}) {
  return (
    <div>
      <h1>items</h1>
      {items.map(item => {
        let label = item.label;
        if (item.important) {
          label = label.toUpperCase();
        }
        return (
          <p key={item.id}>
            <b>{label}</b>
          </p>
        );
      })}
    </div>
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
const _BlockTemplate = _createBlockTemplate([
  "div",
  null,
  null,
  [["h1", null, null, ["items"]], { s: 0 }],
]);
const _BlockTemplate2 = _createBlockTemplate([
  "p",
  null,
  null,
  [["b", null, null, [{ s: 0 }]]],
]); // @enableJsxBlocks @enableListItemMemoization
// The callback reassigns a variable before it creates the element, so the
// element's allocations can move right before the return: the list is
// memoized per item, and the reassigned variable is a dependency.
function List(t0) {
  const $ = _c(7);
  const _listItemCache = useListItemMemoCache();
  const { items } = t0;
  let t1;
  if ($[0] !== items) {
    let t2;
    if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
      t2 = (item) => {
        let label = item.label;
        if (item.important) {
          label = label.toUpperCase();
        }

        const t4 = item.id;
        const $0 = _listItemCache.next(3, t4);
        let t5;
        if ($0[0] !== label || $0[1] !== t4) {
          t5 = <_BlockTemplate2 key={t4} v={[label]} />;
          $0[0] = label;
          $0[1] = t4;
          $0[2] = t5;
        } else {
          t5 = $0[2];
        }
        return t5;
      };
      $[2] = t2;
    } else {
      t2 = $[2];
    }
    t1 = items.map(t2);
    $[0] = items;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[3] !== t1) {
    t2 = [t1];
    $[3] = t1;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  let t3;
  if ($[5] !== t2) {
    t3 = <_BlockTemplate v={t2} />;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  return t3;
}

```
      