
## Input

```javascript
import {Stringify} from 'shared-runtime';

function Component({a, ...rest}) {
  const update = () => {
    rest = {...rest, updated: true};
  };
  update();
  return <Stringify a={a} rest={rest} />;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{a: 1, b: 2}],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime";
import { Stringify } from "shared-runtime";

function Component(t0) {
  const $ = _c(6);
  let a;
  let rest;
  if ($[0] !== t0) {
    const { a: t1, ...t2 } = t0;
    a = t1;
    rest = t2;
    const update = () => {
      rest = { ...rest, updated: true };
    };

    update();
    $[0] = t0;
    $[1] = a;
    $[2] = rest;
  } else {
    a = $[1];
    rest = $[2];
  }
  let t1;
  if ($[3] !== a || $[4] !== rest) {
    t1 = <Stringify a={a} rest={rest} />;
    $[3] = a;
    $[4] = rest;
    $[5] = t1;
  } else {
    t1 = $[5];
  }
  return t1;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{ a: 1, b: 2 }],
};

```
      
### Eval output
(kind: ok) <div>{"a":1,"rest":{"b":2,"updated":true}}</div>