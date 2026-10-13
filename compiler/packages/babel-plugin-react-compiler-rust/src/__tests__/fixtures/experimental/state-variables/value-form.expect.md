
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
  const $ = _c(23);
  const { normalize, initial } = t0;
  const [text, setText] = useState(initial);
  unstable_freezeState(text);
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = [];
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const [tags, setTags] = useState(t1);
  unstable_freezeState(tags);
  let t2;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = (e) => {
      setText(e.target.value);
    };
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  let t3;
  let t4;
  if ($[2] !== text) {
    t3 = <input value={text} onChange={t2} />;
    t4 = (
      <button
        onClick={() => {
          setText(text.trim());
        }}
      >
        trim
      </button>
    );
    $[2] = text;
    $[3] = t3;
    $[4] = t4;
  } else {
    t3 = $[3];
    t4 = $[4];
  }
  let t5;
  if ($[5] !== normalize || $[6] !== text) {
    t5 = (
      <button
        onClick={() => {
          setText(normalize(text));
        }}
      >
        normalize
      </button>
    );
    $[5] = normalize;
    $[6] = text;
    $[7] = t5;
  } else {
    t5 = $[7];
  }
  let t6;
  if ($[8] !== tags || $[9] !== text) {
    t6 = (
      <button
        onClick={() => {
          setTags(tags.concat(text));
        }}
      >
        tag
      </button>
    );
    $[8] = tags;
    $[9] = text;
    $[10] = t6;
  } else {
    t6 = $[10];
  }
  let t7;
  if ($[11] !== normalize || $[12] !== text) {
    t7 = (
      <button
        onClick={() => {
          setText(text + normalize(""));
        }}
      >
        append
      </button>
    );
    $[11] = normalize;
    $[12] = text;
    $[13] = t7;
  } else {
    t7 = $[13];
  }
  let t8;
  if ($[14] !== tags) {
    t8 = tags.join(", ");
    $[14] = tags;
    $[15] = t8;
  } else {
    t8 = $[15];
  }
  let t9;
  if (
    $[16] !== t3 ||
    $[17] !== t4 ||
    $[18] !== t5 ||
    $[19] !== t6 ||
    $[20] !== t7 ||
    $[21] !== t8
  ) {
    t9 = (
      <>
        {t3}
        {t4}
        {t5}
        {t6}
        {t7}
        {t8}
      </>
    );
    $[16] = t3;
    $[17] = t4;
    $[18] = t5;
    $[19] = t6;
    $[20] = t7;
    $[21] = t8;
    $[22] = t9;
  } else {
    t9 = $[22];
  }
  return t9;
}

```
