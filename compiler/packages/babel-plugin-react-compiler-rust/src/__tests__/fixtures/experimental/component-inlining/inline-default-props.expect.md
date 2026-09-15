
## Input

```javascript
// @enableComponentInlining
function Greeting({name = 'world', punctuation}) {
  return (
    <p>
      Hello {name}
      {punctuation}
    </p>
  );
}

function App(props) {
  return (
    <div>
      <Greeting />
      <Greeting name={props.name} punctuation="!" />
    </div>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{name: undefined}],
  sequentialRenders: [{name: undefined}, {name: 'React'}],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableComponentInlining
function Greeting(t0) {
  const $ = _c(3);
  const { name: t1, punctuation } = t0;
  const name = t1 === undefined ? "world" : t1;
  let t2;
  if ($[0] !== name || $[1] !== punctuation) {
    t2 = (
      <p>
        Hello
        {name}
        {punctuation}
      </p>
    );
    $[0] = name;
    $[1] = punctuation;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  return t2;
}

function App(props) {
  const $ = _c(3);

  const t0 = undefined;
  const name = true ? "world" : t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = (
      <p>
        Hello {name}
        {undefined}
      </p>
    );
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const t2 = props.name;
  const name$0 = t2 === undefined ? "world" : t2;
  let t3;
  if ($[1] !== name$0) {
    t3 = (
      <div>
        {t1}
        <p>
          Hello {name$0}
          {"!"}
        </p>
      </div>
    );
    $[1] = name$0;
    $[2] = t3;
  } else {
    t3 = $[2];
  }
  return t3;
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{ name: undefined }],
  sequentialRenders: [{ name: undefined }, { name: "React" }],
};

```
      
### Eval output
(kind: ok) <div><p>Hello world</p><p>Hello world!</p></div>
<div><p>Hello world</p><p>Hello React!</p></div>