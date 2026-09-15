
## Input

```javascript
// @enableJsxBlocks
// The root of a block may have a style: React DOM reads it from the block's
// values where it reads a host component's style after rendering (revealing
// a suspended tree, view transitions).
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
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import { c as _c } from "react/compiler-runtime";
const _BlockTemplate = _createBlockTemplate([
  "div",
  null,
  [["style", 0]],
  [["span", null, null, ["a"]]],
]); // @enableJsxBlocks
// The root of a block may have a style: React DOM reads it from the block's
// values where it reads a host component's style after rendering (revealing
// a suspended tree, view transitions).
function Box(t0) {
  const $ = _c(4);
  const { color } = t0;
  let t1;
  if ($[0] !== color) {
    t1 = [{ color }];
    $[0] = color;
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

```
      