
## Input

```javascript
// @enableJsxBlocks
// Both returns render a <ul> at the component's position, so neither becomes
// a block.
function Items({compact, first, second}) {
  if (compact) {
    return (
      <ul>
        <li>{first}</li>
      </ul>
    );
  }
  return (
    <ul>
      <li>{first}</li>
      <li>{second}</li>
    </ul>
  );
}

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableJsxBlocks
// Both returns render a <ul> at the component's position, so neither becomes
// a block.
function Items(t0) {
  const $ = _c(9);
  const { compact, first, second } = t0;
  if (compact) {
    let t1;
    if ($[0] !== first) {
      t1 = (
        <ul>
          <li>{first}</li>
        </ul>
      );
      $[0] = first;
      $[1] = t1;
    } else {
      t1 = $[1];
    }
    return t1;
  }
  let t1;
  if ($[2] !== first) {
    t1 = <li>{first}</li>;
    $[2] = first;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  let t2;
  if ($[4] !== second) {
    t2 = <li>{second}</li>;
    $[4] = second;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  let t3;
  if ($[6] !== t1 || $[7] !== t2) {
    t3 = (
      <ul>
        {t1}
        {t2}
      </ul>
    );
    $[6] = t1;
    $[7] = t2;
    $[8] = t3;
  } else {
    t3 = $[8];
  }
  return t3;
}

```
      