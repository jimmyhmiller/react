
## Input

```javascript
// @enableJsxBlocks
// The <p>'s only alternative is a <span>, so it becomes a block. The <div>'s
// alternative is the value of `loading`, a prop that could itself be a <div>
// element, so the <div> does not; a comparison (such as `count > 0`) would be
// known to be a primitive.
function Status({loading, error, message, count}) {
  return (
    <main>
      {loading && (
        <div className="spinner">
          <i>loading</i>
        </div>
      )}
      {count > 0 && (
        <div className="count">
          <b>{count}</b>
        </div>
      )}
      {error ? (
        <p className="error">
          <b>{message}</b>
        </p>
      ) : (
        <span>ok</span>
      )}
    </main>
  );
}

```

## Code

```javascript
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import { c as _c } from "react/compiler-runtime";
const _BlockTemplate = _createBlockTemplate([
  "div",
  { className: "count" },
  null,
  [["b", null, null, [{ s: 0 }]]],
]);
const _BlockTemplate2 = _createBlockTemplate([
  "p",
  { className: "error" },
  null,
  [["b", null, null, [{ s: 0 }]]],
]); // @enableJsxBlocks
// The <p>'s only alternative is a <span>, so it becomes a block. The <div>'s
// alternative is the value of `loading`, a prop that could itself be a <div>
// element, so the <div> does not; a comparison (such as `count > 0`) would be
// known to be a primitive.
function Status(t0) {
  const $ = _c(11);
  const { loading, error, message, count } = t0;
  let t1;
  if ($[0] !== loading) {
    t1 = loading && (
      <div className="spinner">
        <i>loading</i>
      </div>
    );
    $[0] = loading;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== count) {
    t2 = count > 0 && <_BlockTemplate v={[count]} />;
    $[2] = count;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== error || $[5] !== message) {
    t3 = error ? <_BlockTemplate2 v={[message]} /> : <span>ok</span>;
    $[4] = error;
    $[5] = message;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  let t4;
  if ($[7] !== t1 || $[8] !== t2 || $[9] !== t3) {
    t4 = (
      <main>
        {t1}
        {t2}
        {t3}
      </main>
    );
    $[7] = t1;
    $[8] = t2;
    $[9] = t3;
    $[10] = t4;
  } else {
    t4 = $[10];
  }
  return t4;
}

```
      