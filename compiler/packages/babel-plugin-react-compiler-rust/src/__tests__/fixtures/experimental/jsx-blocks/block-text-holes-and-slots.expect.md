
## Input

```javascript
// @enableJsxBlocks
function Count({count, children}) {
  return (
    <span className="todo-count">
      <strong>{count + 0}</strong> {`items left`} {count > 1 && 'many'}
      {children}
    </span>
  );
}

```

## Code

```javascript
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import { c as _c } from "react/compiler-runtime";
const _BlockTemplate = _createBlockTemplate([
  "span",
  { className: "todo-count" },
  null,
  [
    ["strong", null, null, [{ t: 0 }]],
    " ",
    "items left",
    " ",
    { s: 1 },
    { s: 2 },
  ],
]); // @enableJsxBlocks
function Count(t0) {
  const $ = _c(6);
  const { count, children } = t0;

  const t1 = count + 0;
  const t2 = count > 1 && "many";
  let t3;
  if ($[0] !== children || $[1] !== t1 || $[2] !== t2) {
    t3 = [t1, t2, children];
    $[0] = children;
    $[1] = t1;
    $[2] = t2;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  let t4;
  if ($[4] !== t3) {
    t4 = <_BlockTemplate v={t3} />;
    $[4] = t3;
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  return t4;
}

```
      