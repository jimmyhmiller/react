
## Input

```javascript
// @enableJsxBlocks @enableListItemMemoization
// A variable is reassigned after the element is created. Moving the element's
// allocations right before the return would read the reassigned value, so the
// list is not memoized per item.
function List({items}) {
  return (
    <div>
      <h1>items</h1>
      {items.map(item => {
        let label = item.label;
        const element = (
          <p key={item.id}>
            <b>{label}</b>
          </p>
        );
        label = label.toUpperCase();
        return element;
      })}
    </div>
  );
}

```

## Code

```javascript
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import { c as _c } from "react/compiler-runtime";
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
// A variable is reassigned after the element is created. Moving the element's
// allocations right before the return would read the reassigned value, so the
// list is not memoized per item.
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
    t3 = <_BlockTemplate v={t2} />;
    $[4] = t2;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  return t3;
}
function _temp(item) {
  const label = item.label;
  const element = <_BlockTemplate2 key={item.id} v={[label]} />;
  label.toUpperCase();
  return element;
}

```
      