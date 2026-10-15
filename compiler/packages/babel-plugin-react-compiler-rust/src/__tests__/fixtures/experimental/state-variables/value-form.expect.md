
## Input

```javascript
// @enableStateVariables
// A write whose value is not computed from the state by pure operators sets the
// value: a method call or a function call on the state, a call between the read
// and the write (which could write the state itself), or no read at all.
function Editor({normalize, initial}) {
  let text = initial;
  let tags = [];
  return (
    <>
      <input value={text} onChange={e => (text = e.target.value)} />
      <button onClick={() => { text = text.trim(); }}>trim</button>
      <button onClick={() => { text = normalize(text); }}>normalize</button>
      <button onClick={() => { tags = tags.concat(text); }}>tag</button>
      <button onClick={() => { text = text + normalize(''); }}>append</button>
      {tags.join(', ')}
    </>
  );
}

```

## Code

```javascript
import { useState } from "react";
import { c as _c, unstable_freezeState } from "react/compiler-runtime"; // @enableStateVariables
// A write whose value is not computed from the state by pure operators sets the
// value: a method call or a function call on the state, a call between the read
// and the write (which could write the state itself), or no read at all.
function Editor(t0) {
  const $ = _c(25);
  const { normalize, initial } = t0;
  const t1 = initial;
  let t2;
  if ($[0] !== t1) {
    t2 = () => t1;
    $[0] = t1;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  const [text, setText] = useState(t2);
  unstable_freezeState(text);
  let t3;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    t3 = [];
    $[2] = t3;
  } else {
    t3 = $[2];
  }
  const [tags, setTags] = useState(t3);
  unstable_freezeState(tags);
  let t4;
  if ($[3] === Symbol.for("react.memo_cache_sentinel")) {
    t4 = (e) => {
      const t5 = e.target.value;
      setText(() => t5);
    };
    $[3] = t4;
  } else {
    t4 = $[3];
  }
  let t5;
  let t6;
  if ($[4] !== text) {
    t5 = <input value={text} onChange={t4} />;
    t6 = (
      <button
        onClick={() => {
          const t7 = text.trim();
          setText(() => t7);
        }}
      >
        trim
      </button>
    );
    $[4] = text;
    $[5] = t5;
    $[6] = t6;
  } else {
    t5 = $[5];
    t6 = $[6];
  }
  let t7;
  if ($[7] !== normalize || $[8] !== text) {
    t7 = (
      <button
        onClick={() => {
          const t8 = normalize(text);
          setText(() => t8);
        }}
      >
        normalize
      </button>
    );
    $[7] = normalize;
    $[8] = text;
    $[9] = t7;
  } else {
    t7 = $[9];
  }
  let t8;
  if ($[10] !== tags || $[11] !== text) {
    t8 = (
      <button
        onClick={() => {
          const t9 = tags.concat(text);
          setTags(() => t9);
        }}
      >
        tag
      </button>
    );
    $[10] = tags;
    $[11] = text;
    $[12] = t8;
  } else {
    t8 = $[12];
  }
  let t9;
  if ($[13] !== normalize || $[14] !== text) {
    t9 = (
      <button
        onClick={() => {
          setText(text + normalize(""));
        }}
      >
        append
      </button>
    );
    $[13] = normalize;
    $[14] = text;
    $[15] = t9;
  } else {
    t9 = $[15];
  }
  let t10;
  if ($[16] !== tags) {
    t10 = tags.join(", ");
    $[16] = tags;
    $[17] = t10;
  } else {
    t10 = $[17];
  }
  let t11;
  if (
    $[18] !== t10 ||
    $[19] !== t5 ||
    $[20] !== t6 ||
    $[21] !== t7 ||
    $[22] !== t8 ||
    $[23] !== t9
  ) {
    t11 = (
      <>
        {t5}
        {t6}
        {t7}
        {t8}
        {t9}
        {t10}
      </>
    );
    $[18] = t10;
    $[19] = t5;
    $[20] = t6;
    $[21] = t7;
    $[22] = t8;
    $[23] = t9;
    $[24] = t11;
  } else {
    t11 = $[24];
  }
  return t11;
}

```
