
## Input

```javascript
// @enableListItemMemoization
// The list is also read (its length), not only rendered, so its items are not
// memoized.
function List({items}) {
  const rows = items.map(item => <li key={item.id}>{item.label}</li>);
  return (
    <div>
      <span>{rows.length}</span>
      <ul>{rows}</ul>
    </div>
  );
}

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableListItemMemoization
// The list is also read (its length), not only rendered, so its items are not
// memoized.
function List(t0) {
  const $ = _c(9);
  const { items } = t0;
  let t1;
  if ($[0] !== items) {
    t1 = items.map(_temp);
    $[0] = items;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const rows = t1;
  let t2;
  if ($[2] !== rows.length) {
    t2 = <span>{rows.length}</span>;
    $[2] = rows.length;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== rows) {
    t3 = <ul>{rows}</ul>;
    $[4] = rows;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  let t4;
  if ($[6] !== t2 || $[7] !== t3) {
    t4 = (
      <div>
        {t2}
        {t3}
      </div>
    );
    $[6] = t2;
    $[7] = t3;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  return t4;
}
function _temp(item) {
  return <li key={item.id}>{item.label}</li>;
}

```
      