
## Input

```javascript
// @enableStateVariables
// `user?.tags.push(tag)` does nothing unless `user` has a value. The updater
// tests what the chain tests, in the state that it is given, and leaves that
// state as it is when the test fails. The handler does not read `user`.
function Profile({tag}) {
  let user = {name: 'Ada', tags: [], address: null};
  let todos = null;
  return (
    <>
      <button onClick={() => { user?.tags.push(tag); }}>tag</button>
      <button onClick={() => { user.address?.lines.push(tag); }}>line</button>
      <button
        onClick={() => {
          todos?.push(tag);
          console.log(todos?.length);
        }}>
        todo
      </button>
      {user.name} {todos?.length}
    </>
  );
}

```

## Code

```javascript
import { useState } from "react";
import {
  c as _c,
  unstable_copyForUpdate,
  unstable_freezeState,
} from "react/compiler-runtime"; // @enableStateVariables
// `user?.tags.push(tag)` does nothing unless `user` has a value. The updater
// tests what the chain tests, in the state that it is given, and leaves that
// state as it is when the test fails. The handler does not read `user`.
function Profile(t0) {
  const $ = _c(10);
  const { tag } = t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = { name: "Ada", tags: [], address: null };
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const [user, setUser] = useState(t1);
  unstable_freezeState(user);
  let t2;
  let t3;
  let t4;
  if ($[1] !== tag) {
    t2 = (
      <button
        onClick={() => {
          setUser((user$0) => {
            if (user$0 == null) {
              return user$0;
            }
            const t5 = unstable_copyForUpdate(user$0);
            const t6 = unstable_copyForUpdate(t5.tags);
            t5.tags = t6;
            t6.push(tag);
            return t5;
          });
        }}
      >
        tag
      </button>
    );
    t3 = (
      <button
        onClick={() => {
          setUser((user$1) => {
            const t7 = unstable_copyForUpdate(user$1);
            const t8 = t7.address;
            if (t8 == null) {
              return user$1;
            }
            const t9 = unstable_copyForUpdate(t8);
            t7.address = t9;
            const t10 = unstable_copyForUpdate(t9.lines);
            t9.lines = t10;
            t10.push(tag);
            return t7;
          });
        }}
      >
        line
      </button>
    );
    t4 = (
      <button
        onClick={() => {
          null?.push(tag);
          console.log(null?.length);
        }}
      >
        todo
      </button>
    );
    $[1] = tag;
    $[2] = t2;
    $[3] = t3;
    $[4] = t4;
  } else {
    t2 = $[2];
    t3 = $[3];
    t4 = $[4];
  }
  let t5;
  if ($[5] !== t2 || $[6] !== t3 || $[7] !== t4 || $[8] !== user.name) {
    t5 = (
      <>
        {t2}
        {t3}
        {t4}
        {user.name} {null?.length}
      </>
    );
    $[5] = t2;
    $[6] = t3;
    $[7] = t4;
    $[8] = user.name;
    $[9] = t5;
  } else {
    t5 = $[9];
  }
  return t5;
}

```
