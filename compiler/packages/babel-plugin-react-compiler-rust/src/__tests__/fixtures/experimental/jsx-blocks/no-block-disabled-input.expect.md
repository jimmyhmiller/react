
## Input

```javascript
// @enableJsxBlocks
// React DOM suppresses mouse events on disabled inputs based on their props,
// so an input with `disabled` is rendered as an ordinary element.
function Field({value, onChange, disabled}) {
  return (
    <div>
      <input value={value} onChange={onChange} disabled={disabled} />
      <span>field</span>
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
  null,
  [{ s: 0 }, ["span", null, null, ["field"]]],
]); // @enableJsxBlocks
// React DOM suppresses mouse events on disabled inputs based on their props,
// so an input with `disabled` is rendered as an ordinary element.
function Field(t0) {
  const $ = _c(6);
  const { value, onChange, disabled } = t0;
  let t1;
  if ($[0] !== disabled || $[1] !== onChange || $[2] !== value) {
    t1 = [<input value={value} onChange={onChange} disabled={disabled} />];
    $[0] = disabled;
    $[1] = onChange;
    $[2] = value;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  let t2;
  if ($[4] !== t1) {
    t2 = <_BlockTemplate v={t1} />;
    $[4] = t1;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  return t2;
}

```
      