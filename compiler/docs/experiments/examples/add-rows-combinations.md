# Compiling one list app with every combination of the experiment flags

Generated with `compiler/scripts/experiment-compile.mjs`. Every section is the
real output of the Rust React Compiler for the source below, printed without
`@babel/preset-react` so the JSX stays readable, and with `--prune`, which
drops the declarations nothing reaches any more.

```bash
cd compiler
node scripts/experiment-compile.mjs AddRows.jsx --inlining --blocks --lists --incremental --prune
```

Pruning matters because the compiler never deletes a function. When a
component is inlined, its own compiled definition is still emitted, along with
a duplicate of every callback inside it; nothing references it, so the bundler
drops it. `--prune` does the same thing here, so each output is what actually
ships. Drop the flag to see everything the compiler emitted, duplicates and
all.

## Source

```jsx
import {useState} from 'react';

const makeRows = start => [...Array(1000).keys()].map(i => ({id: start + i}));

function Row({item}) {
  return (
    <li>
      <span>{item.id}</span>
      <strong>Item {item.id}</strong>
    </li>
  );
}

function List({items}) {
  return <ul>{items.map(item => <Row key={item.id} item={item} />)}</ul>;
}

function App() {
  const [items, setItems] = useState([]);
  return (
    <main>
      <button onClick={() => setItems(items => [...items, ...makeRows(items.length)])}>
        Add 1,000 rows
      </button>
      <List items={items} />
    </main>
  );
}
```

## All 16 combinations

The "components" column is the components still rendered as elements, and
"templates" counts the block templates that survive pruning, not the ones the
compiler created.

The four flags give 16 combinations but only 12 distinct outputs: without
`enableListItemMemoization`, `enableIncrementalListMapping` does nothing.

| inlining | blocks | lists | incremental | templates | components | list call | output |
|---|---|---|---|---|---|---|---|
|  |  |  |  | 0 | Row, List | `items.map` | [#1](#output-1) |
| x |  |  |  | 0 | Row | `items.map` | [#2](#output-2) |
|  | x |  |  | 3 | Row, List | `items.map` | [#3](#output-3) |
| x | x |  |  | 2 | — | `items.map` | [#4](#output-4) |
|  |  | x |  | 0 | Row, List | `items.map` + per-item cache | [#5](#output-5) |
| x |  | x |  | 0 | Row | `items.map` + per-item cache | [#6](#output-6) |
|  | x | x |  | 3 | Row, List | `items.map` + per-item cache | [#7](#output-7) |
| x | x | x |  | 2 | — | `items.map` + per-item cache | [#8](#output-8) |
|  |  |  | x | 0 | Row, List | `items.map` | [#1](#output-1) |
| x |  |  | x | 0 | Row | `items.map` | [#2](#output-2) |
|  | x |  | x | 3 | Row, List | `items.map` | [#3](#output-3) |
| x | x |  | x | 2 | — | `items.map` | [#4](#output-4) |
|  |  | x | x | 0 | Row, List | `mapIncremental` | [#9](#output-9) |
| x |  | x | x | 0 | Row | `mapIncremental` | [#10](#output-10) |
|  | x | x | x | 3 | Row, List | `mapIncremental` | [#11](#output-11) |
| x | x | x | x | 2 | — | `mapIncremental` | [#12](#output-12) |

<a id="output-1"></a>

## Output 1: standard compiler

Produced by: no flags, `--incremental`

Both components are real components with their own memo caches. `items.map` is untouched: every render of `List` calls the callback for every item, and each `Row` bails out through its own cache. `--incremental` on its own changes nothing — it requires `enableListItemMemoization`.

```js
import { c as _c } from "react/compiler-runtime";
import { useState } from 'react';
const makeRows = start => [...Array(1000).keys()].map(i => ({
  id: start + i
}));
function Row(t0) {
  const $ = _c(2);
  const {
    item
  } = t0;
  let t1;
  if ($[0] !== item.id) {
    t1 = <li><span>{item.id}</span><strong>Item {item.id}</strong></li>;
    $[0] = item.id;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}
function List(t0) {
  const $ = _c(4);
  const {
    items
  } = t0;
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
    t2 = <ul>{t1}</ul>;
    $[2] = t1;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  return t2;
}
function _temp(item) {
  return <Row key={item.id} item={item} />;
}
function App() {
  const $ = _c(4);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const [items, setItems] = useState(t0);
  let t1;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = <button onClick={() => setItems(_temp2)}>Add 1,000 rows</button>;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== items) {
    t2 = <main>{t1}<List items={items} /></main>;
    $[2] = items;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  return t2;
}
function _temp2(items_0) {
  return [...items_0, ...makeRows(items_0.length)];
}
```

<a id="output-2"></a>

## Output 2: `--inlining`

Produced by: `--inlining`, `--inlining --incremental`

The `<List />` call site in `App` is replaced by `List`'s body, so `App` now contains the `<ul>` and its own copy of the map callback (`_temp3`, the same code as `List`'s `_temp`). `Row` is still rendered as an element: a `.map` callback site is only inlined when the callee compiles to a block (experiment 0001, rule 16), because otherwise the component is the per-row memoization boundary.

```js
import { c as _c } from "react/compiler-runtime";
import { useState } from 'react';
const makeRows = start => [...Array(1000).keys()].map(i => ({
  id: start + i
}));
function Row(t0) {
  const $ = _c(2);
  const {
    item
  } = t0;
  let t1;
  if ($[0] !== item.id) {
    t1 = <li><span>{item.id}</span><strong>Item {item.id}</strong></li>;
    $[0] = item.id;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}
function App() {
  const $ = _c(6);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const [items, setItems] = useState(t0);
  let t1;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = <button onClick={() => setItems(_temp2)}>Add 1,000 rows</button>;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const items$0 = items;
  let t2;
  if ($[2] !== items$0) {
    t2 = items$0.map(_temp3);
    $[2] = items$0;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== t2) {
    t3 = <main>{t1}<ul>{t2}</ul></main>;
    $[4] = t2;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  return t3;
}
function _temp3(item) {
  return <Row key={item.id} item={item} />;
}
function _temp2(items_0) {
  return [...items_0, ...makeRows(items_0.length)];
}
```

<a id="output-3"></a>

## Output 3: `--blocks`

Produced by: `--blocks`, `--blocks --incremental`

Three templates are created at module scope. `Row` and `List` remain components, but each now returns a block element, so the host subtree inside each one is a template plus a values array.

```js
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import { c as _c } from "react/compiler-runtime";
import { useState } from 'react';
const _BlockTemplate = _createBlockTemplate(["li", null, null, [["span", null, null, [{
  "s": 0
}]], ["strong", null, null, ["Item ", {
  "s": 1
}]]]]);
const _BlockTemplate2 = _createBlockTemplate(["ul", null, null, [{
  "s": 0
}]]);
const _BlockTemplate3 = _createBlockTemplate(["main", null, null, [["button", null, [["onClick", 0]], ["Add 1,000 rows"]], {
  "s": 1
}]]);
const makeRows = start => [...Array(1000).keys()].map(i => ({
  id: start + i
}));
function Row(t0) {
  const $ = _c(4);
  const {
    item
  } = t0;
  let t1;
  if ($[0] !== item.id) {
    t1 = [item.id, item.id];
    $[0] = item.id;
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
  const $ = _c(6);
  const {
    items
  } = t0;
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
  return <Row key={item.id} item={item} />;
}
function App() {
  const $ = _c(6);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const [items, setItems] = useState(t0);
  let t1;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => setItems(_temp2);
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== items) {
    t2 = [t1, <List items={items} />];
    $[2] = items;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== t2) {
    t3 = <_BlockTemplate3 v={t2} />;
    $[4] = t2;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  return t3;
}
function _temp2(items_0) {
  return [...items_0, ...makeRows(items_0.length)];
}
```

<a id="output-4"></a>

## Output 4: `--inlining --blocks`

Produced by: `--inlining --blocks`, `--inlining --blocks --incremental`

Neither component is rendered as an element any more. The callback returns `<_BlockTemplate v={[...]} />` directly, and `App` renders a single root block holding the button and the list slot. This is the pairing that made the list workloads fast.

```js
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import { c as _c } from "react/compiler-runtime";
import { useState } from 'react';
const _BlockTemplate = _createBlockTemplate(["li", null, null, [["span", null, null, [{
  "s": 0
}]], ["strong", null, null, ["Item ", {
  "s": 1
}]]]]);
const _BlockTemplate3 = _createBlockTemplate(["main", null, null, [["button", null, [["onClick", 0]], ["Add 1,000 rows"]], ["ul", null, null, [{
  "s": 1
}]]]]);
const makeRows = start => [...Array(1000).keys()].map(i => ({
  id: start + i
}));
function App() {
  const $ = _c(8);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const [items, setItems] = useState(t0);
  let t1;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => setItems(_temp2);
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const items$0 = items;
  let t2;
  if ($[2] !== items$0) {
    t2 = items$0.map(_temp3);
    $[2] = items$0;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== t2) {
    t3 = [t1, t2];
    $[4] = t2;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  let t4;
  if ($[6] !== t3) {
    t4 = <_BlockTemplate3 v={t3} />;
    $[6] = t3;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  return t4;
}
function _temp3(item) {
  const item$0 = item;
  return <_BlockTemplate key={item.id} v={[item$0.id, item$0.id]} />;
}
function _temp2(items_0) {
  return [...items_0, ...makeRows(items_0.length)];
}
```

<a id="output-5"></a>

## Output 5: `--lists`

Produced by: `--lists`

The callback gets a per-item cache: `_listItemCache.next(3, item.id)`. The item element is memoized per item and keyed, so an unchanged row returns its previous `<Row />` element even though the callback still runs.

```js
import { c as _c, unstable_useListItemMemoCache as useListItemMemoCache } from "react/compiler-runtime";
import { useState } from 'react';
const makeRows = start => [...Array(1000).keys()].map(i => ({
  id: start + i
}));
function Row(t0) {
  const $ = _c(2);
  const {
    item
  } = t0;
  let t1;
  if ($[0] !== item.id) {
    t1 = <li><span>{item.id}</span><strong>Item {item.id}</strong></li>;
    $[0] = item.id;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}
function List(t0) {
  const $ = _c(5);
  const _listItemCache = useListItemMemoCache();
  const {
    items
  } = t0;
  let t1;
  if ($[0] !== items) {
    let t2;
    if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
      t2 = item => {
        const t3 = item.id;
        const $0 = _listItemCache.next(3, t3);
        let t4;
        if ($0[0] !== item || $0[1] !== t3) {
          t4 = <Row key={t3} item={item} />;
          $0[0] = item;
          $0[1] = t3;
          $0[2] = t4;
        } else {
          t4 = $0[2];
        }
        return t4;
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
    t2 = <ul>{t1}</ul>;
    $[3] = t1;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  return t2;
}
function App() {
  const $ = _c(4);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const [items, setItems] = useState(t0);
  let t1;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = <button onClick={() => setItems(_temp)}>Add 1,000 rows</button>;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== items) {
    t2 = <main>{t1}<List items={items} /></main>;
    $[2] = items;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  return t2;
}
function _temp(items_0) {
  return [...items_0, ...makeRows(items_0.length)];
}
```

<a id="output-6"></a>

## Output 6: `--inlining --lists`

Produced by: `--inlining --lists`

As above, plus the `<List />` call site inlined into `App` — note `App` now makes its own `useListItemMemoCache()` call. `Row` is still rendered as an element, for the reason given under `--inlining`.

```js
import { c as _c, unstable_useListItemMemoCache as useListItemMemoCache } from "react/compiler-runtime";
import { useState } from 'react';
const makeRows = start => [...Array(1000).keys()].map(i => ({
  id: start + i
}));
function Row(t0) {
  const $ = _c(2);
  const {
    item
  } = t0;
  let t1;
  if ($[0] !== item.id) {
    t1 = <li><span>{item.id}</span><strong>Item {item.id}</strong></li>;
    $[0] = item.id;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}
function App() {
  const $ = _c(7);
  const _listItemCache2 = useListItemMemoCache();
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const [items, setItems] = useState(t0);
  let t1;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = <button onClick={() => setItems(_temp)}>Add 1,000 rows</button>;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const items$0 = items;
  let t2;
  if ($[2] !== items$0) {
    let t3;
    if ($[4] === Symbol.for("react.memo_cache_sentinel")) {
      t3 = item => {
        const t4 = item.id;
        const $0 = _listItemCache2.next(3, t4);
        let t5;
        if ($0[0] !== item || $0[1] !== t4) {
          t5 = <Row key={t4} item={item} />;
          $0[0] = item;
          $0[1] = t4;
          $0[2] = t5;
        } else {
          t5 = $0[2];
        }
        return t5;
      };
      $[4] = t3;
    } else {
      t3 = $[4];
    }
    t2 = items$0.map(t3);
    $[2] = items$0;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[5] !== t2) {
    t3 = <main>{t1}<ul>{t2}</ul></main>;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  return t3;
}
function _temp(items_0) {
  return [...items_0, ...makeRows(items_0.length)];
}
```

<a id="output-7"></a>

## Output 7: `--blocks --lists`

Produced by: `--blocks --lists`

Per-item caches around block elements, but with both components still present: `Row` returns a block, and the callback memoizes the `<Row />` element per item.

```js
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import { c as _c, unstable_useListItemMemoCache as useListItemMemoCache } from "react/compiler-runtime";
import { useState } from 'react';
const _BlockTemplate = _createBlockTemplate(["li", null, null, [["span", null, null, [{
  "s": 0
}]], ["strong", null, null, ["Item ", {
  "s": 1
}]]]]);
const _BlockTemplate2 = _createBlockTemplate(["ul", null, null, [{
  "s": 0
}]]);
const _BlockTemplate3 = _createBlockTemplate(["main", null, null, [["button", null, [["onClick", 0]], ["Add 1,000 rows"]], {
  "s": 1
}]]);
const makeRows = start => [...Array(1000).keys()].map(i => ({
  id: start + i
}));
function Row(t0) {
  const $ = _c(4);
  const {
    item
  } = t0;
  let t1;
  if ($[0] !== item.id) {
    t1 = [item.id, item.id];
    $[0] = item.id;
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
  const $ = _c(7);
  const _listItemCache = useListItemMemoCache();
  const {
    items
  } = t0;
  let t1;
  if ($[0] !== items) {
    let t2;
    if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
      t2 = item => {
        const t4 = item.id;
        const $0 = _listItemCache.next(3, t4);
        let t5;
        if ($0[0] !== item || $0[1] !== t4) {
          t5 = <Row key={t4} item={item} />;
          $0[0] = item;
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
    t3 = <_BlockTemplate2 v={t2} />;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  return t3;
}
function App() {
  const $ = _c(6);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const [items, setItems] = useState(t0);
  let t1;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => setItems(_temp);
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== items) {
    t2 = [t1, <List items={items} />];
    $[2] = items;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== t2) {
    t3 = <_BlockTemplate3 v={t2} />;
    $[4] = t2;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  return t3;
}
function _temp(items_0) {
  return [...items_0, ...makeRows(items_0.length)];
}
```

<a id="output-8"></a>

## Output 8: `--inlining --blocks --lists`

Produced by: `--inlining --blocks --lists`

No components are rendered as elements: the callback builds the row block itself and memoizes it in a per-item cache keyed by `item.id`.

```js
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import { c as _c, unstable_useListItemMemoCache as useListItemMemoCache } from "react/compiler-runtime";
import { useState } from 'react';
const _BlockTemplate = _createBlockTemplate(["li", null, null, [["span", null, null, [{
  "s": 0
}]], ["strong", null, null, ["Item ", {
  "s": 1
}]]]]);
const _BlockTemplate3 = _createBlockTemplate(["main", null, null, [["button", null, [["onClick", 0]], ["Add 1,000 rows"]], ["ul", null, null, [{
  "s": 1
}]]]]);
const makeRows = start => [...Array(1000).keys()].map(i => ({
  id: start + i
}));
function App() {
  const $ = _c(9);
  const _listItemCache2 = useListItemMemoCache();
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const [items, setItems] = useState(t0);
  let t1;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => setItems(_temp);
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const items$0 = items;
  let t2;
  if ($[2] !== items$0) {
    let t3;
    if ($[4] === Symbol.for("react.memo_cache_sentinel")) {
      t3 = item => {
        const t5 = item.id;
        const item$0 = item;
        const t6 = item$0.id;
        const t7 = item$0.id;
        const $0 = _listItemCache2.next(4, t5);
        let t8;
        if ($0[0] !== t5 || $0[1] !== t6 || $0[2] !== t7) {
          t8 = <_BlockTemplate key={t5} v={[t6, t7]} />;
          $0[0] = t5;
          $0[1] = t6;
          $0[2] = t7;
          $0[3] = t8;
        } else {
          t8 = $0[3];
        }
        return t8;
      };
      $[4] = t3;
    } else {
      t3 = $[4];
    }
    t2 = items$0.map(t3);
    $[2] = items$0;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[5] !== t2) {
    t3 = [t1, t2];
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  let t4;
  if ($[7] !== t3) {
    t4 = <_BlockTemplate3 v={t3} />;
    $[7] = t3;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  return t4;
}
function _temp(items_0) {
  return [...items_0, ...makeRows(items_0.length)];
}
```

<a id="output-9"></a>

## Output 9: `--lists --incremental`

Produced by: `--lists --incremental`

The per-item cache is gone from the callback (`next` is never called) and `items.map(...)` becomes `_listItemCache.mapIncremental(items, t1, [])`. The map is now the memoization boundary: an unchanged prefix is copied without invoking the callback at all.

```js
import { c as _c, unstable_useListItemMemoCache as useListItemMemoCache } from "react/compiler-runtime";
import { useState } from 'react';
const makeRows = start => [...Array(1000).keys()].map(i => ({
  id: start + i
}));
function Row(t0) {
  const $ = _c(2);
  const {
    item
  } = t0;
  let t1;
  if ($[0] !== item.id) {
    t1 = <li><span>{item.id}</span><strong>Item {item.id}</strong></li>;
    $[0] = item.id;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}
function List(t0) {
  const $ = _c(7);
  const _listItemCache = useListItemMemoCache();
  const {
    items
  } = t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = item => <Row key={item.id} item={item} />;
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
function App() {
  const $ = _c(4);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const [items, setItems] = useState(t0);
  let t1;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = <button onClick={() => setItems(_temp)}>Add 1,000 rows</button>;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== items) {
    t2 = <main>{t1}<List items={items} /></main>;
    $[2] = items;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  return t2;
}
function _temp(items_0) {
  return [...items_0, ...makeRows(items_0.length)];
}
```

<a id="output-10"></a>

## Output 10: `--inlining --lists --incremental`

Produced by: `--inlining --lists --incremental`

Incremental mapping with the `<List />` call site inlined into `App`.

```js
import { c as _c, unstable_useListItemMemoCache as useListItemMemoCache } from "react/compiler-runtime";
import { useState } from 'react';
const makeRows = start => [...Array(1000).keys()].map(i => ({
  id: start + i
}));
function Row(t0) {
  const $ = _c(2);
  const {
    item
  } = t0;
  let t1;
  if ($[0] !== item.id) {
    t1 = <li><span>{item.id}</span><strong>Item {item.id}</strong></li>;
    $[0] = item.id;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}
function App() {
  const $ = _c(9);
  const _listItemCache2 = useListItemMemoCache();
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const [items, setItems] = useState(t0);
  let t1;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = <button onClick={() => setItems(_temp)}>Add 1,000 rows</button>;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const items$0 = items;
  let t2;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = item => <Row key={item.id} item={item} />;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== _listItemCache2 || $[4] !== items$0 || $[5] !== t2) {
    t3 = _listItemCache2.mapIncremental(items$0, t2, []);
    $[3] = _listItemCache2;
    $[4] = items$0;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  let t4;
  if ($[7] !== t3) {
    t4 = <main>{t1}<ul>{t3}</ul></main>;
    $[7] = t3;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  return t4;
}
function _temp(items_0) {
  return [...items_0, ...makeRows(items_0.length)];
}
```

<a id="output-11"></a>

## Output 11: `--blocks --lists --incremental`

Produced by: `--blocks --lists --incremental`

Incremental mapping over rows that are block elements, with both components still in place.

```js
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import { c as _c, unstable_useListItemMemoCache as useListItemMemoCache } from "react/compiler-runtime";
import { useState } from 'react';
const _BlockTemplate = _createBlockTemplate(["li", null, null, [["span", null, null, [{
  "s": 0
}]], ["strong", null, null, ["Item ", {
  "s": 1
}]]]]);
const _BlockTemplate2 = _createBlockTemplate(["ul", null, null, [{
  "s": 0
}]]);
const _BlockTemplate3 = _createBlockTemplate(["main", null, null, [["button", null, [["onClick", 0]], ["Add 1,000 rows"]], {
  "s": 1
}]]);
const makeRows = start => [...Array(1000).keys()].map(i => ({
  id: start + i
}));
function Row(t0) {
  const $ = _c(4);
  const {
    item
  } = t0;
  let t1;
  if ($[0] !== item.id) {
    t1 = [item.id, item.id];
    $[0] = item.id;
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
  const $ = _c(9);
  const _listItemCache = useListItemMemoCache();
  const {
    items
  } = t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = item => <Row key={item.id} item={item} />;
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
    t3 = [t2];
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  let t4;
  if ($[7] !== t3) {
    t4 = <_BlockTemplate2 v={t3} />;
    $[7] = t3;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  return t4;
}
function App() {
  const $ = _c(6);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const [items, setItems] = useState(t0);
  let t1;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => setItems(_temp);
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== items) {
    t2 = [t1, <List items={items} />];
    $[2] = items;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== t2) {
    t3 = <_BlockTemplate3 v={t2} />;
    $[4] = t2;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  return t3;
}
function _temp(items_0) {
  return [...items_0, ...makeRows(items_0.length)];
}
```

<a id="output-12"></a>

## Output 12: `--inlining --blocks --lists --incremental`

Produced by: `--inlining --blocks --lists --incremental`

Everything on. Three templates, nothing rendered as a component, one block element per row built from a two-value array, and the list mapped incrementally so adding 1,000 rows invokes the callback 1,000 times instead of once per existing row.

```js
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import { c as _c, unstable_useListItemMemoCache as useListItemMemoCache } from "react/compiler-runtime";
import { useState } from 'react';
const _BlockTemplate = _createBlockTemplate(["li", null, null, [["span", null, null, [{
  "s": 0
}]], ["strong", null, null, ["Item ", {
  "s": 1
}]]]]);
const _BlockTemplate3 = _createBlockTemplate(["main", null, null, [["button", null, [["onClick", 0]], ["Add 1,000 rows"]], ["ul", null, null, [{
  "s": 1
}]]]]);
const makeRows = start => [...Array(1000).keys()].map(i => ({
  id: start + i
}));
function App() {
  const $ = _c(11);
  const _listItemCache2 = useListItemMemoCache();
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const [items, setItems] = useState(t0);
  let t1;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => setItems(_temp);
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const items$0 = items;
  let t2;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = item => {
      const item$0 = item;
      return <_BlockTemplate key={item.id} v={[item$0.id, item$0.id]} />;
    };
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== _listItemCache2 || $[4] !== items$0 || $[5] !== t2) {
    t3 = _listItemCache2.mapIncremental(items$0, t2, []);
    $[3] = _listItemCache2;
    $[4] = items$0;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  let t4;
  if ($[7] !== t3) {
    t4 = [t1, t3];
    $[7] = t3;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  let t5;
  if ($[9] !== t4) {
    t5 = <_BlockTemplate3 v={t4} />;
    $[9] = t4;
    $[10] = t5;
  } else {
    t5 = $[10];
  }
  return t5;
}
function _temp(items_0) {
  return [...items_0, ...makeRows(items_0.length)];
}
```
