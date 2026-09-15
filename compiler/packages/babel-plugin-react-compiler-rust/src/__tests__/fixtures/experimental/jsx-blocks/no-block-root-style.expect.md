
## Input

```javascript
// @enableJsxBlocks
function Box({color}) {
  return (
    <div style={{color}}>
      <span>a</span>
    </div>
  );
}

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableJsxBlocks
function Box(t0) {
  const $ = _c(5);
  const { color } = t0;
  let t1;
  if ($[0] !== color) {
    t1 = { color };
    $[0] = color;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = <span>a</span>;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== t1) {
    t3 = <div style={t1}>{t2}</div>;
    $[3] = t1;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  return t3;
}

```
      