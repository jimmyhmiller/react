
## Input

```javascript
import {Stringify} from 'shared-runtime';

function foo() {
  return (
    <Stringify
      value={[
        'inf' == 1 / 0,
        '-inf' == -1 / 0,
        'INFINITY' == 1 / 0,
        'infinity' == 1 / 0,
        'Infinity' == 1 / 0,
        '-Infinity' == -1 / 0,
        '12' == 12,
      ]}
    />
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: foo,
  params: [],
  isComponent: false,
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime";
import { Stringify } from "shared-runtime";

function foo() {
  const $ = _c(1);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = <Stringify value={[false, false, false, false, true, true, true]} />;
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  return t0;
}

export const FIXTURE_ENTRYPOINT = {
  fn: foo,
  params: [],
  isComponent: false,
};

```
      
### Eval output
(kind: ok) <div>{"value":[false,false,false,false,true,true,true]}</div>