
## Input

```javascript
// @enableStaticIslands
// The article body has no handlers or refs, so it is wrapped in an island. The
// header's button has a handler: the header is not wrapped, but its static
// <nav> is.
function Page({title, body}) {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <header>
        <button onClick={() => setOpen(!open)}>menu</button>
        <nav>
          <a href="/docs">Docs</a>
          <a href="/blog">Blog</a>
        </nav>
      </header>
      <article>
        <h1>{title}</h1>
        <p>{body}</p>
        <p>Last updated today.</p>
      </article>
    </main>
  );
}

```

## Code

```javascript
import {
  c as _c,
  unstable_StaticIsland as StaticIsland,
} from "react/compiler-runtime"; // @enableStaticIslands
// The article body has no handlers or refs, so it is wrapped in an island. The
// header's button has a handler: the header is not wrapped, but its static
// <nav> is.
function Page(t0) {
  const $ = _c(18);
  const { title, body } = t0;
  const [open, setOpen] = useState(false);
  let t1;
  if ($[0] !== open) {
    t1 = <button onClick={() => setOpen(!open)}>menu</button>;
    $[0] = open;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = (
      <StaticIsland>
        <nav>
          <a href="/docs">Docs</a>
          <a href="/blog">Blog</a>
        </nav>
      </StaticIsland>
    );
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== t1) {
    t3 = (
      <header>
        {t1}
        {t2}
      </header>
    );
    $[3] = t1;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  let t4;
  if ($[5] !== title) {
    t4 = <h1>{title}</h1>;
    $[5] = title;
    $[6] = t4;
  } else {
    t4 = $[6];
  }
  let t5;
  if ($[7] !== body) {
    t5 = <p>{body}</p>;
    $[7] = body;
    $[8] = t5;
  } else {
    t5 = $[8];
  }
  let t6;
  if ($[9] === Symbol.for("react.memo_cache_sentinel")) {
    t6 = <p>Last updated today.</p>;
    $[9] = t6;
  } else {
    t6 = $[9];
  }
  let t7;
  if ($[10] !== t4 || $[11] !== t5) {
    t7 = (
      <article>
        {t4}
        {t5}
        {t6}
      </article>
    );
    $[10] = t4;
    $[11] = t5;
    $[12] = t7;
  } else {
    t7 = $[12];
  }
  let t8;
  if ($[13] !== t7) {
    t8 = <StaticIsland>{t7}</StaticIsland>;
    $[13] = t7;
    $[14] = t8;
  } else {
    t8 = $[14];
  }
  let t9;
  if ($[15] !== t3 || $[16] !== t8) {
    t9 = (
      <main>
        {t3}
        {t8}
      </main>
    );
    $[15] = t3;
    $[16] = t8;
    $[17] = t9;
  } else {
    t9 = $[17];
  }
  return t9;
}

```
      