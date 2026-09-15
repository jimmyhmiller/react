
## Input

```javascript
// @enableComponentInlining @panicThreshold:"none"
// Label mutates its props, which the compiler rejects. Inlined, the props
// object would be a local of App and the mutation would go undetected, so
// Label must not be offered as a candidate (rule C5).
function Label(props) {
  props.seen = true;
  return <span>{props.text}</span>;
}

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
import { c as _c } from "react/compiler-runtime"; // @enableComponentInlining @panicThreshold:"none"
// Label mutates its props, which the compiler rejects. Inlined, the props
// object would be a local of App and the mutation would go undetected, so
// Label must not be offered as a candidate (rule C5).
function Label(props) {
  props.seen = true;
  return <span>{props.text}</span>;
}

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
(kind: exception) Cannot add property seen, object is not extensible