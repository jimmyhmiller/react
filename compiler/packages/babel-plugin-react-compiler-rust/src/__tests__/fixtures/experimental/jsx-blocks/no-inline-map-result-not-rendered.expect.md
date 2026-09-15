
## Input

```javascript
// @enableJsxBlocks @enableComponentInlining
// The result of .map is passed to a component instead of being rendered, so
// the callback's items are not rendered positions.
function Row({item}) {
  return (
    <li>
      <span>{item.label}</span>
    </li>
  );
}

function List({items, Wrapper}) {
  const rows = items.map(item => <Row key={item.id} item={item} />);
  return <Wrapper rows={rows} />;
}

```

## Code

```javascript
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import { c as _c } from "react/compiler-runtime";
const _BlockTemplate = _createBlockTemplate([
  "li",
  null,
  null,
  [["span", null, null, [{ s: 0 }]]],
]); // @enableJsxBlocks @enableComponentInlining
// The result of .map is passed to a component instead of being rendered, so
// the callback's items are not rendered positions.
function Row(t0) {
  const $ = _c(4);
  const { item } = t0;
  let t1;
  if ($[0] !== item.label) {
    t1 = [item.label];
    $[0] = item.label;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== t1) {
    t2 = <_BlockTemplate v={t1} />;
    $[2] = t1;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  return t2;
}

function List(t0) {
  const $ = _c(5);
  const { items, Wrapper } = t0;
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
  if ($[2] !== Wrapper || $[3] !== rows) {
    t2 = <Wrapper rows={rows} />;
    $[2] = Wrapper;
    $[3] = rows;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  return t2;
}
function _temp(item) {
  return <Row key={item.id} item={item} />;
}

```
      