
## Input

```javascript
// @enableJsxBlocks @enableComponentInlining
// Badge calls a hook, so it cannot be inlined into Item. Item's block then has
// a slot holding Badge's element: Item is not a leaf block and stays the
// per-item memoization boundary of the callback.
import {useState} from 'react';

function Badge({count}) {
  const [highlighted] = useState(false);
  return <b className={highlighted ? 'on' : 'off'}>{count}</b>;
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
import { c as _c } from "react/compiler-runtime"; // @enableJsxBlocks @enableComponentInlining
// Badge calls a hook, so it cannot be inlined into Item. Item's block then has
// a slot holding Badge's element: Item is not a leaf block and stays the
// per-item memoization boundary of the callback.
import { useState } from "react";
const _BlockTemplate = _createBlockTemplate([
  "li",
  null,
  null,
  [["span", null, null, [{ s: 0 }]], { s: 1 }],
]);
const _BlockTemplate2 = _createBlockTemplate([
  "ul",
  null,
  null,
  [["li", null, null, ["header"]], { s: 0 }],
]);

function Badge(t0) {
  const $ = _c(3);
  const { count } = t0;
  const [highlighted] = useState(false);
  const t1 = highlighted ? "on" : "off";
  let t2;
  if ($[0] !== count || $[1] !== t1) {
    t2 = <b className={t1}>{count}</b>;
    $[0] = count;
    $[1] = t1;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  return t2;
}

function Item(t0) {
  const $ = _c(7);
  const { item } = t0;
  let t1;
  if ($[0] !== item.count) {
    t1 = <Badge count={item.count} />;
    $[0] = item.count;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== item.label || $[3] !== t1) {
    t2 = [item.label, t1];
    $[2] = item.label;
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
  return <Item key={item.id} item={item} />;
}

```
      