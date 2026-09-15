
## Input

```javascript
// @enableJsxBlocks
// An element passed to a component can be rendered anywhere by that component,
// next to other elements with the same tag, so it does not become a block.
function Page({title, Wrapper}) {
  return (
    <Wrapper>
      <div className="title">
        <b>{title}</b>
      </div>
    </Wrapper>
  );
}

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableJsxBlocks
// An element passed to a component can be rendered anywhere by that component,
// next to other elements with the same tag, so it does not become a block.
function Page(t0) {
  const $ = _c(5);
  const { title, Wrapper } = t0;
  let t1;
  if ($[0] !== title) {
    t1 = (
      <div className="title">
        <b>{title}</b>
      </div>
    );
    $[0] = title;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== Wrapper || $[3] !== t1) {
    t2 = <Wrapper>{t1}</Wrapper>;
    $[2] = Wrapper;
    $[3] = t1;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  return t2;
}

```
      