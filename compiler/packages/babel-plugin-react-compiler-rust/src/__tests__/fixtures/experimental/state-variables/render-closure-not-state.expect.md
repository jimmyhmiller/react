
## Input

```javascript
// @enableStateVariables
// A variable that is only reassigned during render is not state.
function Total({items}) {
  let total = 0;
  items.forEach(item => {
    total += item.price;
  });
  return <span>{total}</span>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Total,
  params: [{items: [{price: 1}, {price: 2}]}],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableStateVariables
// A variable that is only reassigned during render is not state.
function Total(t0) {
  const $ = _c(4);
  const { items } = t0;
  let total;
  if ($[0] !== items) {
    total = 0;
    items.forEach((item) => {
      total = total + item.price;
      total;
    });
    $[0] = items;
    $[1] = total;
  } else {
    total = $[1];
  }
  let t1;
  if ($[2] !== total) {
    t1 = <span>{total}</span>;
    $[2] = total;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  return t1;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Total,
  params: [{ items: [{ price: 1 }, { price: 2 }] }],
};

```
