
## Input

```javascript
// @enableStaticIslands
// Callout and Note call no hooks and only render static elements, so an
// element of Callout is static and wrapped where it is rendered (not inside
// Callout or Note, where islands would be nested in their callers' islands).
// Counter calls a hook, so the section holding it is not, but its static
// children are.
function Note({children}) {
  return <aside className="note">{children}</aside>;
}

function Callout({title, children}) {
  return (
    <div className="callout">
      <strong>{title}</strong>
      <Note>{children}</Note>
    </div>
  );
}

function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}

function Docs({text}) {
  return (
    <section>
      <Callout title="Tip">
        <p>{text}</p>
      </Callout>
      <Counter />
      <ul>
        <li>one</li>
        <li>two</li>
      </ul>
    </section>
  );
}

```

## Code

```javascript
import {
  c as _c,
  unstable_StaticIsland as StaticIsland,
} from "react/compiler-runtime"; // @enableStaticIslands
// Callout and Note call no hooks and only render static elements, so an
// element of Callout is static and wrapped where it is rendered (not inside
// Callout or Note, where islands would be nested in their callers' islands).
// Counter calls a hook, so the section holding it is not, but its static
// children are.
function Note(t0) {
  const $ = _c(2);
  const { children } = t0;
  let t1;
  if ($[0] !== children) {
    t1 = <aside className="note">{children}</aside>;
    $[0] = children;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

function Callout(t0) {
  const $ = _c(7);
  const { title, children } = t0;
  let t1;
  if ($[0] !== title) {
    t1 = <strong>{title}</strong>;
    $[0] = title;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== children) {
    t2 = <Note>{children}</Note>;
    $[2] = children;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== t1 || $[5] !== t2) {
    t3 = (
      <div className="callout">
        {t1}
        {t2}
      </div>
    );
    $[4] = t1;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  return t3;
}

function Counter() {
  const $ = _c(5);
  const [count, setCount] = useState(0);
  let t0;
  if ($[0] !== count) {
    t0 = () => setCount(count + 1);
    $[0] = count;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  let t1;
  if ($[2] !== count || $[3] !== t0) {
    t1 = <button onClick={t0}>{count}</button>;
    $[2] = count;
    $[3] = t0;
    $[4] = t1;
  } else {
    t1 = $[4];
  }
  return t1;
}

function Docs(t0) {
  const $ = _c(8);
  const { text } = t0;
  let t1;
  if ($[0] !== text) {
    t1 = (
      <Callout title="Tip">
        <p>{text}</p>
      </Callout>
    );
    $[0] = text;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== t1) {
    t2 = <StaticIsland>{t1}</StaticIsland>;
    $[2] = t1;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  let t4;
  if ($[4] === Symbol.for("react.memo_cache_sentinel")) {
    t3 = <Counter />;
    t4 = (
      <StaticIsland>
        <ul>
          <li>one</li>
          <li>two</li>
        </ul>
      </StaticIsland>
    );
    $[4] = t3;
    $[5] = t4;
  } else {
    t3 = $[4];
    t4 = $[5];
  }
  let t5;
  if ($[6] !== t2) {
    t5 = (
      <section>
        {t2}
        {t3}
        {t4}
      </section>
    );
    $[6] = t2;
    $[7] = t5;
  } else {
    t5 = $[7];
  }
  return t5;
}

```
      