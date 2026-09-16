
## Input

```javascript
// @enableListItemMemoization @enableIncrementalListMapping
// A one-parameter callback cannot observe shifted indices or the source array,
// so unchanged prefixes and suffixes can reuse their previous mapped results.
function List({items}) {
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>{item.label}</li>
      ))}
    </ul>
  );
}

```

## Code

```javascript
import {
  c as _c,
  unstable_useListItemMemoCache as useListItemMemoCache,
} from "react/compiler-runtime"; // @enableListItemMemoization @enableIncrementalListMapping
// A one-parameter callback cannot observe shifted indices or the source array,
// so unchanged prefixes and suffixes can reuse their previous mapped results.
function List(t0) {
  const $ = _c(7);
  const _listItemCache = useListItemMemoCache();
  const { items } = t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = (item) => <li key={item.id}>{item.label}</li>;
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  let t2;
  if ($[1] !== _listItemCache || $[2] !== items || $[3] !== t1) {
    t2 = _listItemCache.mapIncremental(items, t1, []);
    $[1] = _listItemCache;
    $[2] = items;
    $[3] = t1;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  let t3;
  if ($[5] !== t2) {
    t3 = <ul>{t2}</ul>;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  return t3;
}

```
      