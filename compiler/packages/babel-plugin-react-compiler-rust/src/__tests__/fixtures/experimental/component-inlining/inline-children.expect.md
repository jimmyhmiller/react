
## Input

```javascript
// @enableComponentInlining
function Card({title, children}) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Page(props) {
  return (
    <Card title={props.title}>
      <p>{props.body}</p>
      <p>footer</p>
    </Card>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: Page,
  params: [{title: 't', body: 'b'}],
  sequentialRenders: [
    {title: 't', body: 'b'},
    {title: 't2', body: 'b'},
  ],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableComponentInlining
function Card(t0) {
  const $ = _c(5);
  const { title, children } = t0;
  let t1;
  if ($[0] !== title) {
    t1 = <h2>{title}</h2>;
    $[0] = title;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== children || $[3] !== t1) {
    t2 = (
      <section>
        {t1}
        {children}
      </section>
    );
    $[2] = children;
    $[3] = t1;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  return t2;
}

function Page(props) {
  const $ = _c(10);
  let t0;
  if ($[0] !== props.body) {
    t0 = <p>{props.body}</p>;
    $[0] = props.body;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  let t1;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = <p>footer</p>;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[3] !== t0) {
    t2 = (
      <>
        {t0}
        {t1}
      </>
    );
    $[3] = t0;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  const title = props.title;
  const children = t2;
  let t3;
  if ($[5] !== title) {
    t3 = <h2>{title}</h2>;
    $[5] = title;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  let t4;
  if ($[7] !== children || $[8] !== t3) {
    t4 = (
      <section>
        {t3}
        {children}
      </section>
    );
    $[7] = children;
    $[8] = t3;
    $[9] = t4;
  } else {
    t4 = $[9];
  }
  return t4;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Page,
  params: [{ title: "t", body: "b" }],
  sequentialRenders: [
    { title: "t", body: "b" },
    { title: "t2", body: "b" },
  ],
};

```
      
### Eval output
(kind: ok) <section><h2>t</h2><p>b</p><p>footer</p></section>
<section><h2>t2</h2><p>b</p><p>footer</p></section>