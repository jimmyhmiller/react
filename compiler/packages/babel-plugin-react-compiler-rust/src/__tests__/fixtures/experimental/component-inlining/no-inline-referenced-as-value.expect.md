
## Input

```javascript
// @enableComponentInlining
function Label({text}) {
  return <span>{text}</span>;
}
Label.displayName = 'MyLabel';

function App() {
  return (
    <div>
      <Label text="a" />
    </div>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{}],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableComponentInlining
function Label(t0) {
  const $ = _c(2);
  const { text } = t0;
  let t1;
  if ($[0] !== text) {
    t1 = <span>{text}</span>;
    $[0] = text;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

Label.displayName = "MyLabel";

function App() {
  const $ = _c(1);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = (
      <div>
        <Label text="a" />
      </div>
    );
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  return t0;
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{}],
};

```
      
### Eval output
(kind: ok) <div><span>a</span></div>