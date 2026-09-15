
## Input

```javascript
// @enableJsxBlocks
// Controlled inputs are part of the block. Elements with enter/leave events
// are not; they are rendered in slots as ordinary elements.
function Row({checked, onChange, onEnter}) {
  return (
    <div className="row">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span onMouseEnter={onEnter}>hover</span>
      <p>static</p>
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
  { className: "row" },
  null,
  [
    [
      "input",
      { type: "checkbox" },
      [
        ["checked", 0],
        ["onChange", 1],
      ],
      [],
    ],
    { s: 2 },
    ["p", null, null, ["static"]],
  ],
]); // @enableJsxBlocks
// Controlled inputs are part of the block. Elements with enter/leave events
// are not; they are rendered in slots as ordinary elements.
function Row(t0) {
  const $ = _c(8);
  const { checked, onChange, onEnter } = t0;
  let t1;
  if ($[0] !== onEnter) {
    t1 = <span onMouseEnter={onEnter}>hover</span>;
    $[0] = onEnter;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== checked || $[3] !== onChange || $[4] !== t1) {
    t2 = [checked, onChange, t1];
    $[2] = checked;
    $[3] = onChange;
    $[4] = t1;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  let t3;
  if ($[6] !== t2) {
    t3 = <_BlockTemplate v={t2} />;
    $[6] = t2;
    $[7] = t3;
  } else {
    t3 = $[7];
  }
  return t3;
}

```
      