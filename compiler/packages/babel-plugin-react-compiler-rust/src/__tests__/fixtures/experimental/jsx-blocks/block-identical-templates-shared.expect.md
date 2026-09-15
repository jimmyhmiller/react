
## Input

```javascript
// @enableJsxBlocks
// Identical trees in different functions share one module-scope template.
function Primary({label, onClick}) {
  return (
    <div className="card">
      <button onClick={onClick}>{label}</button>
    </div>
  );
}

function Secondary({title, onSelect}) {
  return (
    <div className="card">
      <button onClick={onSelect}>{title}</button>
    </div>
  );
}

function Different({label}) {
  return (
    <div className="other">
      <button>{label}</button>
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
  { className: "card" },
  null,
  [["button", null, [["onClick", 0]], [{ s: 1 }]]],
]);
const _BlockTemplate2 = _createBlockTemplate([
  "div",
  { className: "other" },
  null,
  [["button", null, null, [{ s: 0 }]]],
]); // @enableJsxBlocks
// Identical trees in different functions share one module-scope template.
function Primary(t0) {
  const $ = _c(5);
  const { label, onClick } = t0;
  let t1;
  if ($[0] !== label || $[1] !== onClick) {
    t1 = [onClick, label];
    $[0] = label;
    $[1] = onClick;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[3] !== t1) {
    t2 = <_BlockTemplate v={t1} />;
    $[3] = t1;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  return t2;
}

function Secondary(t0) {
  const $ = _c(5);
  const { title, onSelect } = t0;
  let t1;
  if ($[0] !== onSelect || $[1] !== title) {
    t1 = [onSelect, title];
    $[0] = onSelect;
    $[1] = title;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[3] !== t1) {
    t2 = <_BlockTemplate v={t1} />;
    $[3] = t1;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  return t2;
}

function Different(t0) {
  const $ = _c(4);
  const { label } = t0;
  let t1;
  if ($[0] !== label) {
    t1 = [label];
    $[0] = label;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== t1) {
    t2 = <_BlockTemplate2 v={t1} />;
    $[2] = t1;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  return t2;
}

```
      