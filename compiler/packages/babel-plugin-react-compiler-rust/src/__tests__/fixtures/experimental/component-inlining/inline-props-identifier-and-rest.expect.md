
## Input

```javascript
// @enableComponentInlining
function Link(props) {
  return <a href={props.href}>{props.children}</a>;
}

function Badge({label, ...rest}) {
  return <span title={rest.title}>{label}</span>;
}

function Nav(props) {
  return (
    <nav>
      <Link href={props.href}>home</Link>
      <Badge label="new" title={props.title} />
    </nav>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: Nav,
  params: [{href: '/', title: 'x'}],
  sequentialRenders: [
    {href: '/', title: 'x'},
    {href: '/a', title: 'y'},
  ],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableComponentInlining
function Link(props) {
  const $ = _c(3);
  let t0;
  if ($[0] !== props.children || $[1] !== props.href) {
    t0 = <a href={props.href}>{props.children}</a>;
    $[0] = props.children;
    $[1] = props.href;
    $[2] = t0;
  } else {
    t0 = $[2];
  }
  return t0;
}

function Badge(t0) {
  const $ = _c(6);
  let label;
  let rest;
  if ($[0] !== t0) {
    ({ label, ...rest } = t0);
    $[0] = t0;
    $[1] = label;
    $[2] = rest;
  } else {
    label = $[1];
    rest = $[2];
  }
  let t1;
  if ($[3] !== label || $[4] !== rest.title) {
    t1 = <span title={rest.title}>{label}</span>;
    $[3] = label;
    $[4] = rest.title;
    $[5] = t1;
  } else {
    t1 = $[5];
  }
  return t1;
}

function Nav(props) {
  const $ = _c(12);
  let t0;
  if ($[0] !== props.href) {
    t0 = { href: props.href, children: "home" };
    $[0] = props.href;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  const props$0 = t0;
  let t1;
  if ($[2] !== props$0.children || $[3] !== props$0.href) {
    t1 = <a href={props$0.href}>{props$0.children}</a>;
    $[2] = props$0.children;
    $[3] = props$0.href;
    $[4] = t1;
  } else {
    t1 = $[4];
  }
  const t2 = t1;
  let t3;
  if ($[5] !== props.title) {
    t3 = { title: props.title };
    $[5] = props.title;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  const rest = t3;
  let t4;
  if ($[7] !== rest.title) {
    t4 = <span title={rest.title}>{"new"}</span>;
    $[7] = rest.title;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  const t5 = t4;
  let t6;
  if ($[9] !== t2 || $[10] !== t5) {
    t6 = (
      <nav>
        {t2}
        {t5}
      </nav>
    );
    $[9] = t2;
    $[10] = t5;
    $[11] = t6;
  } else {
    t6 = $[11];
  }
  return t6;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Nav,
  params: [{ href: "/", title: "x" }],
  sequentialRenders: [
    { href: "/", title: "x" },
    { href: "/a", title: "y" },
  ],
};

```
      
### Eval output
(kind: ok) <nav><a href="/">home</a><span title="x">new</span></nav>
<nav><a href="/a">home</a><span title="y">new</span></nav>