
## Input

```javascript
/**
 * A function expression that only appears as a child of a JSX *fragment* is
 * not assumed to be invoked during render (unlike one passed to a JSX element
 * as a prop or child), so the property loads in its body must not be treated
 * as hoistable non-null paths. The dependency here should be `a`, not `a.b.c`.
 */
function Component({a}) {
  const cb = () => a.b.c;
  return <>{cb}</>;
}

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; /**
 * A function expression that only appears as a child of a JSX *fragment* is
 * not assumed to be invoked during render (unlike one passed to a JSX element
 * as a prop or child), so the property loads in its body must not be treated
 * as hoistable non-null paths. The dependency here should be `a`, not `a.b.c`.
 */
function Component(t0) {
  const $ = _c(2);
  const { a } = t0;
  let t1;
  if ($[0] !== a) {
    const cb = () => a.b.c;
    t1 = <>{cb}</>;
    $[0] = a;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

```
      
### Eval output
(kind: exception) Fixture not implemented