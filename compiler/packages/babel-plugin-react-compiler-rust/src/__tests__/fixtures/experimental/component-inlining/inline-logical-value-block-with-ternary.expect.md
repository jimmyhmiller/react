
## Input

```javascript
// @enableComponentInlining
function Pill({active, label}) {
  return <span className={active ? 'on' : 'off'}>{label}</span>;
}

function Filters({show, active}) {
  return <div>{show === true && <Pill active={active} label="all" />}</div>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Filters,
  params: [{show: false, active: false}],
  sequentialRenders: [
    {show: false, active: false},
    {show: true, active: false},
    {show: true, active: true},
  ],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableComponentInlining
function Pill(t0) {
  const $ = _c(3);
  const { active, label } = t0;
  const t1 = active ? "on" : "off";
  let t2;
  if ($[0] !== label || $[1] !== t1) {
    t2 = <span className={t1}>{label}</span>;
    $[0] = label;
    $[1] = t1;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  return t2;
}

function Filters(t0) {
  const $ = _c(5);
  const { show, active } = t0;
  let t1;
  if ($[0] !== active || $[1] !== show) {
    t1 =
      show === true &&
      ("all", (<span className={active ? "on" : "off"}>{"all"}</span>));
    $[0] = active;
    $[1] = show;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[3] !== t1) {
    t2 = <div>{t1}</div>;
    $[3] = t1;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  return t2;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Filters,
  params: [{ show: false, active: false }],
  sequentialRenders: [
    { show: false, active: false },
    { show: true, active: false },
    { show: true, active: true },
  ],
};

```
      
### Eval output
(kind: ok) <div></div>
<div><span class="off">all</span></div>
<div><span class="on">all</span></div>