
## Input

```javascript
// @enableJsxBlocks
// Children that React renders as nothing stay in the template as `null`: they
// have no DOM node, but count as children for the tree positions (useId) of
// their siblings, so a block hydrates the HTML of the equivalent host elements.
function Greeting({name, children}) {
  return (
    <div>
      {null}
      <span>
        {false}
        {name}
      </span>
      {''}
      {children}
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
  [null, ["span", null, null, [null, { s: 0 }]], null, { s: 1 }],
]); // @enableJsxBlocks
// Children that React renders as nothing stay in the template as `null`: they
// have no DOM node, but count as children for the tree positions (useId) of
// their siblings, so a block hydrates the HTML of the equivalent host elements.
function Greeting(t0) {
  const $ = _c(5);
  const { name, children } = t0;
  let t1;
  if ($[0] !== children || $[1] !== name) {
    t1 = [name, children];
    $[0] = children;
    $[1] = name;
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

```
      