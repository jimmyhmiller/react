
## Input

```javascript
// @flow @compilationMode:"infer"
function Component(props: null) {
  return <div>{Math.max(1, 2)}</div>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [null],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime";
function Component(props) {
  const $ = _c(1);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = <div>{Math.max(1, 2)}</div>;
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  return t0;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [null],
};

```
      
### Eval output
(kind: ok) <div>2</div>