
## Input

```javascript
// @enableListItemMemoization
// The list is passed to a component, which could inspect or reorder its
// elements, so its items are not memoized.
function List({items, Layout}) {
  return <Layout>{items.map(item => <b key={item.id}>{item.label}</b>)}</Layout>;
}

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableListItemMemoization
// The list is passed to a component, which could inspect or reorder its
// elements, so its items are not memoized.
function List(t0) {
  const $ = _c(5);
  const { items, Layout } = t0;
  let t1;
  if ($[0] !== items) {
    t1 = items.map(_temp);
    $[0] = items;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== Layout || $[3] !== t1) {
    t2 = <Layout>{t1}</Layout>;
    $[2] = Layout;
    $[3] = t1;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  return t2;
}
function _temp(item) {
  return <b key={item.id}>{item.label}</b>;
}

```
      