
## Input

```javascript
// @enableJsxBlocks
function Label({text}) {
  return <label className="x">{text}</label>;
}

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableJsxBlocks
function Label(t0) {
  const $ = _c(2);
  const { text } = t0;
  let t1;
  if ($[0] !== text) {
    t1 = <label className="x">{text}</label>;
    $[0] = text;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

```
      