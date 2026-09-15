
## Input

```javascript
// @enableJsxBlocks
// The list is combined with another keyed <li>, whose key could equal an
// item's key, so the items do not become blocks.
function List({items}) {
  const rows = items.map(item => (
    <li key={item.id}>
      <b>{item.label}</b>
    </li>
  ));
  return (
    <ul>
      {[
        ...rows,
        <li key="more">
          <i>more</i>
        </li>,
      ]}
    </ul>
  );
}

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableJsxBlocks
// The list is combined with another keyed <li>, whose key could equal an
// item's key, so the items do not become blocks.
function List(t0) {
  const $ = _c(3);
  const { items } = t0;
  let t1;
  if ($[0] !== items) {
    const rows = items.map(_temp);
    let t2;
    if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
      t2 = (
        <li key="more">
          <i>more</i>
        </li>
      );
      $[2] = t2;
    } else {
      t2 = $[2];
    }
    t1 = <ul>{[...rows, t2]}</ul>;
    $[0] = items;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}
function _temp(item) {
  return (
    <li key={item.id}>
      <b>{item.label}</b>
    </li>
  );
}

```
      