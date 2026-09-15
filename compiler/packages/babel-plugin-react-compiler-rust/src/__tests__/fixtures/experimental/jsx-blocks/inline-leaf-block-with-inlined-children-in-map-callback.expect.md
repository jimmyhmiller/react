
## Input

```javascript
// @enableJsxBlocks @enableComponentInlining
// Compiled without inlining, Item's slot holds Badge's element, so Item is not
// a leaf block. With Badge inlined, Item is a leaf block, so it is inlined into
// the callback together with Badge, and the list renders without fibers.
function Badge({count}) {
  return <b>{count}</b>;
}

function Item({item}) {
  return (
    <li>
      <span>{item.label}</span>
      <Badge count={item.count} />
    </li>
  );
}

function List({items}) {
  return (
    <ul>
      <li>header</li>
      {items.map(item => (
        <Item key={item.id} item={item} />
      ))}
    </ul>
  );
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
  [
    ["span", null, null, [{ s: 0 }]],
    ["b", null, null, [{ s: 1 }]],
  ],
]);
const _BlockTemplate2 = _createBlockTemplate([
  "ul",
  null,
  null,
  [["li", null, null, ["header"]], { s: 0 }],
]); // @enableJsxBlocks @enableComponentInlining
// Compiled without inlining, Item's slot holds Badge's element, so Item is not
// a leaf block. With Badge inlined, Item is a leaf block, so it is inlined into
// the callback together with Badge, and the list renders without fibers.
function Badge(t0) {
  const $ = _c(2);
  const { count } = t0;
  let t1;
  if ($[0] !== count) {
    t1 = <b>{count}</b>;
    $[0] = count;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

function Item(t0) {
  const $ = _c(5);
  const { item } = t0;

  const count = item.count;
  let t1;
  if ($[0] !== count || $[1] !== item.label) {
    t1 = [item.label, count];
    $[0] = count;
    $[1] = item.label;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[3] !== t1) {
    t2 = <_BlockTemplate v={t1} />;
    $[3] = t1;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  return t2;
}

function List(t0) {
  const $ = _c(6);
  const { items } = t0;
  let t1;
  if ($[0] !== items) {
    t1 = items.map(_temp);
    $[0] = items;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== t1) {
    t2 = [t1];
    $[2] = t1;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== t2) {
    t3 = <_BlockTemplate2 v={t2} />;
    $[4] = t2;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  return t3;
}
function _temp(item) {
  const item$0 = item;
  const count = item$0.count;
  return <_BlockTemplate key={item.id} v={[item$0.label, count]} />;
}

```
      