
## Input

```javascript
// @enableTreatRefLikeIdentifiersAsRefs @validateRefAccessDuringRender

// `höheRef` is a legal JS identifier but is NOT ref-like per the TS
// `RefLikeNameRE` (/^(?:[a-zA-Z$_][a-zA-Z$_0-9]*)Ref$|^ref$/), because `ö` is
// not in [a-zA-Z$_0-9]. So `höheRef.current` is an ordinary property read and
// may be accessed during render.
function Component(props) {
  const höheRef = {current: props.value};
  return <div>{höheRef.current}</div>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{value: 42}],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableTreatRefLikeIdentifiersAsRefs @validateRefAccessDuringRender

// `höheRef` is a legal JS identifier but is NOT ref-like per the TS
// `RefLikeNameRE` (/^(?:[a-zA-Z$_][a-zA-Z$_0-9]*)Ref$|^ref$/), because `ö` is
// not in [a-zA-Z$_0-9]. So `höheRef.current` is an ordinary property read and
// may be accessed during render.
function Component(props) {
  const $ = _c(4);
  let t0;
  if ($[0] !== props.value) {
    t0 = { current: props.value };
    $[0] = props.value;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  const höheRef = t0;
  let t1;
  if ($[2] !== höheRef.current) {
    t1 = <div>{höheRef.current}</div>;
    $[2] = höheRef.current;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  return t1;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{ value: 42 }],
};

```
      
### Eval output
(kind: ok) <div>42</div>