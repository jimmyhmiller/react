
## Input

```javascript
// @enableComponentInlining
// The compiler does not memoize inside callbacks, so Item is the per-item
// memoization boundary. Without compiled blocks, inlining it into the .map
// callback would be unobservable but would re-render every item whenever the
// list renders.
function Item({item, selected}) {
  return <li className={selected ? 'selected' : ''}>{item.label}</li>;
}

function List({items, selectedId}) {
  return (
    <ul>
      {items.map(item => (
        <Item key={item.id} item={item} selected={item.id === selectedId} />
      ))}
    </ul>
  );
}

const a = {id: 1, label: 'a'};
const b = {id: 2, label: 'b'};
export const FIXTURE_ENTRYPOINT = {
  fn: List,
  params: [{items: [a, b], selectedId: 1}],
  sequentialRenders: [
    {items: [a, b], selectedId: 1},
    {items: [a, b], selectedId: 2},
    {items: [b, a], selectedId: 2},
    {items: [b], selectedId: 2},
  ],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableComponentInlining
// The compiler does not memoize inside callbacks, so Item is the per-item
// memoization boundary. Without compiled blocks, inlining it into the .map
// callback would be unobservable but would re-render every item whenever the
// list renders.
function Item(t0) {
  const $ = _c(3);
  const { item, selected } = t0;
  const t1 = selected ? "selected" : "";
  let t2;
  if ($[0] !== item.label || $[1] !== t1) {
    t2 = <li className={t1}>{item.label}</li>;
    $[0] = item.label;
    $[1] = t1;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  return t2;
}

function List(t0) {
  const $ = _c(7);
  const { items, selectedId } = t0;
  let t1;
  if ($[0] !== items || $[1] !== selectedId) {
    let t2;
    if ($[3] !== selectedId) {
      t2 = (item) => (
        <Item key={item.id} item={item} selected={item.id === selectedId} />
      );
      $[3] = selectedId;
      $[4] = t2;
    } else {
      t2 = $[4];
    }
    t1 = items.map(t2);
    $[0] = items;
    $[1] = selectedId;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[5] !== t1) {
    t2 = <ul>{t1}</ul>;
    $[5] = t1;
    $[6] = t2;
  } else {
    t2 = $[6];
  }
  return t2;
}

const a = { id: 1, label: "a" };
const b = { id: 2, label: "b" };
export const FIXTURE_ENTRYPOINT = {
  fn: List,
  params: [{ items: [a, b], selectedId: 1 }],
  sequentialRenders: [
    { items: [a, b], selectedId: 1 },
    { items: [a, b], selectedId: 2 },
    { items: [b, a], selectedId: 2 },
    { items: [b], selectedId: 2 },
  ],
};

```
      
### Eval output
(kind: ok) <ul><li class="selected">a</li><li class="">b</li></ul>
<ul><li class="">a</li><li class="selected">b</li></ul>
<ul><li class="selected">b</li><li class="">a</li></ul>
<ul><li class="selected">b</li></ul>