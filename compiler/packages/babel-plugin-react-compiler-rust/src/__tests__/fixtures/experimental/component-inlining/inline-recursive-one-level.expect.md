
## Input

```javascript
// @enableComponentInlining
// Tree renders itself. It is inlined into App once; the recursive site inside
// the inlined body is left alone (rule C7).
function Tree({depth}) {
  return <div>{depth > 0 && <Tree depth={depth - 1} />}</div>;
}

function App() {
  return (
    <main>
      <Tree depth={2} />
    </main>
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
// Tree renders itself. It is inlined into App once; the recursive site inside
// the inlined body is left alone (rule C7).
function Tree(t0) {
  const $ = _c(4);
  const { depth } = t0;
  let t1;
  if ($[0] !== depth) {
    t1 = depth > 0 && <Tree depth={depth - 1} />;
    $[0] = depth;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== t1) {
    t2 = <div>{t1}</div>;
    $[2] = t1;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  return t2;
}

function App() {
  const $ = _c(1);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = (
      <main>
        <div>{true && <Tree depth={1} />}</div>
      </main>
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
(kind: ok) <main><div><div><div></div></div></div></main>