
## Input

```javascript
import {Stringify} from 'shared-runtime';

function Component({value}) {
  const obj = {value};
  const r = Math.random(obj);
  return <Stringify obj={obj} hasNumber={typeof r === 'number'} />;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{value: 42}],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime";
import { Stringify } from "shared-runtime";

function Component(t0) {
  const $ = _c(7);
  const { value } = t0;
  let t1;
  if ($[0] !== value) {
    t1 = { value };
    $[0] = value;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const obj = t1;
  let t2;
  if ($[2] !== obj) {
    t2 = Math.random(obj);
    $[2] = obj;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  const r = t2;
  const t3 = typeof r === "number";
  let t4;
  if ($[4] !== obj || $[5] !== t3) {
    t4 = <Stringify obj={obj} hasNumber={t3} />;
    $[4] = obj;
    $[5] = t3;
    $[6] = t4;
  } else {
    t4 = $[6];
  }
  return t4;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{ value: 42 }],
};

```
      
### Eval output
(kind: ok) <div>{"obj":{"value":42},"hasNumber":true}</div>