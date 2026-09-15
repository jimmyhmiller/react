
## Input

```javascript
// @enableStaticIslands
// Both branches render a <div> at the same position: React keeps the <div>'s
// DOM node when the branch changes, so neither is wrapped (an island has
// another type), and their text-only children are too small. A subtree whose
// element is passed to a component is not at a fixed position either.
function Panel({expanded, content}) {
  return (
    <Frame
      header={
        <div>
          <h2>Title</h2>
          <p>Subtitle</p>
        </div>
      }>
      {expanded ? (
        <div className="expanded">
          <p>{content}</p>
          <p>More</p>
        </div>
      ) : (
        <div className="collapsed">
          <p>{content}</p>
          <p>Less</p>
        </div>
      )}
    </Frame>
  );
}

function Frame({header, children}) {
  const ref = useRef(null);
  return (
    <div ref={ref}>
      {header}
      {children}
    </div>
  );
}

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableStaticIslands
// Both branches render a <div> at the same position: React keeps the <div>'s
// DOM node when the branch changes, so neither is wrapped (an island has
// another type), and their text-only children are too small. A subtree whose
// element is passed to a component is not at a fixed position either.
function Panel(t0) {
  const $ = _c(4);
  const { expanded, content } = t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = (
      <div>
        <h2>Title</h2>
        <p>Subtitle</p>
      </div>
    );
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  let t2;
  if ($[1] !== content || $[2] !== expanded) {
    t2 = (
      <Frame header={t1}>
        {expanded ? (
          <div className="expanded">
            <p>{content}</p>
            <p>More</p>
          </div>
        ) : (
          <div className="collapsed">
            <p>{content}</p>
            <p>Less</p>
          </div>
        )}
      </Frame>
    );
    $[1] = content;
    $[2] = expanded;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  return t2;
}

function Frame(t0) {
  const $ = _c(3);
  const { header, children } = t0;
  const ref = useRef(null);
  let t1;
  if ($[0] !== children || $[1] !== header) {
    t1 = (
      <div ref={ref}>
        {header}
        {children}
      </div>
    );
    $[0] = children;
    $[1] = header;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  return t1;
}

```
      