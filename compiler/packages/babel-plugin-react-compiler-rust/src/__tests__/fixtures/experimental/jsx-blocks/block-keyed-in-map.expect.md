
## Input

```javascript
// @enableJsxBlocks
function List({items}) {
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>
          <b>{item.name}</b>
        </li>
      ))}
    </ul>
  );
}

```

## Code

```javascript
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import { c as _c } from "react/compiler-runtime";
const _BlockTemplate = _createBlockTemplate(["ul", null, null, [{ s: 0 }]]);
const _BlockTemplate2 = _createBlockTemplate([
  "li",
  null,
  null,
  [["b", null, null, [{ s: 0 }]]],
]); // @enableJsxBlocks
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
  return <_BlockTemplate2 key={item.id} v={[item.name]} />;
}

```
      