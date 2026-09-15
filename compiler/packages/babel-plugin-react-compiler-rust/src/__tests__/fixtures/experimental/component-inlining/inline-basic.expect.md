
## Input

```javascript
// @enableComponentInlining
function Label({text}) {
  return <span className="label">{text}</span>;
}

function Row(props) {
  return (
    <li>
      <Label text={props.name} />
    </li>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: Row,
  params: [{name: 'a'}],
  sequentialRenders: [{name: 'a'}, {name: 'a'}, {name: 'b'}],
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
    t1 = <span className="label">{text}</span>;
    $[0] = text;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

function Row(props) {
  const $ = _c(2);

  const text = props.name;
  let t0;
  if ($[0] !== text) {
    t0 = (
      <li>
        <span className="label">{text}</span>
      </li>
    );
    $[0] = text;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  return t0;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Row,
  params: [{ name: "a" }],
  sequentialRenders: [{ name: "a" }, { name: "a" }, { name: "b" }],
};

```
      
### Eval output
(kind: ok) <li><span class="label">a</span></li>
<li><span class="label">a</span></li>
<li><span class="label">b</span></li>