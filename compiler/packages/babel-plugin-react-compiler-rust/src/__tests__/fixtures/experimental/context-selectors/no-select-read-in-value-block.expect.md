
## Input

```javascript
// @enableContextSelectors
// The hook call is part of an expression (a value block), which cannot contain
// the statements the rewrite adds, so it is not selected.
function Component(props) {
  const {data} = usePagination(props.id).items ?? {data: []};
  return <ul>{data.map(item => <li key={item.id}>{item.label}</li>)}</ul>;
}

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableContextSelectors
// The hook call is part of an expression (a value block), which cannot contain
// the statements the rewrite adds, so it is not selected.
function Component(props) {
  const $ = _c(4);
  const { data } = usePagination(props.id).items ?? { data: [] };
  let t0;
  if ($[0] !== data) {
    t0 = data.map(_temp);
    $[0] = data;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  let t1;
  if ($[2] !== t0) {
    t1 = <ul>{t0}</ul>;
    $[2] = t0;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  return t1;
}
function _temp(item) {
  return <li key={item.id}>{item.label}</li>;
}

```
      