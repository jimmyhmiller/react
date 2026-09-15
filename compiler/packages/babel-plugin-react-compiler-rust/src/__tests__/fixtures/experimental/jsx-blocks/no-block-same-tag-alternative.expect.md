
## Input

```javascript
// @enableJsxBlocks
// Both branches render a <div> at the same position. React keeps the <div>'s
// DOM node when the branch changes; a block (a different type) would be
// remounted, so neither element becomes a block.
function Panel({expanded, title}) {
  return (
    <section>
      {expanded ? (
        <div className="expanded">
          <b>{title}</b>
        </div>
      ) : (
        <div>{title}</div>
      )}
    </section>
  );
}

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableJsxBlocks
// Both branches render a <div> at the same position. React keeps the <div>'s
// DOM node when the branch changes; a block (a different type) would be
// remounted, so neither element becomes a block.
function Panel(t0) {
  const $ = _c(3);
  const { expanded, title } = t0;
  let t1;
  if ($[0] !== expanded || $[1] !== title) {
    t1 = (
      <section>
        {expanded ? (
          <div className="expanded">
            <b>{title}</b>
          </div>
        ) : (
          <div>{title}</div>
        )}
      </section>
    );
    $[0] = expanded;
    $[1] = title;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  return t1;
}

```
      