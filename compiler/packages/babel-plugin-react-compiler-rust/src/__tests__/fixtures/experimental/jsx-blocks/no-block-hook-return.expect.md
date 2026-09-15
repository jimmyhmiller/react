
## Input

```javascript
// @enableJsxBlocks
// A hook's return value is rendered wherever its caller renders it, so it does
// not become a block.
function useBadge(count) {
  return (
    <span className="badge">
      <b>{count}</b>
    </span>
  );
}

function Counter({count}) {
  const badge = useBadge(count);
  return <div>{badge}</div>;
}

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableJsxBlocks
// A hook's return value is rendered wherever its caller renders it, so it does
// not become a block.
function useBadge(count) {
  const $ = _c(2);
  let t0;
  if ($[0] !== count) {
    t0 = (
      <span className="badge">
        <b>{count}</b>
      </span>
    );
    $[0] = count;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  return t0;
}

function Counter(t0) {
  const $ = _c(2);
  const { count } = t0;
  const badge = useBadge(count);
  let t1;
  if ($[0] !== badge) {
    t1 = <div>{badge}</div>;
    $[0] = badge;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

```
      