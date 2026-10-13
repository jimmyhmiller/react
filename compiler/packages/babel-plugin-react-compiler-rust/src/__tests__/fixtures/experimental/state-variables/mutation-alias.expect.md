
## Input

```javascript
// @enableStateVariables
// A `const` that holds a value of the state is the path it was read from.
function Todos() {
  let todos = [{id: 0, title: 'one', done: false}];
  return (
    <button
      onClick={() => {
        const first = todos[0];
        first.done = true;
        first.title += '!';
      }}>
      {todos[0].title}
    </button>
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
// A `const` that holds a value of the state is the path it was read from.
function Todos() {
  const $ = _c(6);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [{ id: 0, title: "one", done: false }];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const [todos, setTodos] = useState(t0);
  unstable_freezeState(todos);
  let t1;
  if ($[1] !== todos) {
    t1 = () => {
      let currentTodos = todos;

      const t2 = _temp;
      currentTodos = t2(currentTodos);
      setTodos(t2);
      const t3 = currentTodos[0].title + "!";
      const t6 = (todos$0) => {
        const t4 = unstable_copyForUpdate(todos$0);
        const t5 = unstable_copyForUpdate(t4[0]);
        t4[0] = t5;
        t5.title = t3;
        return t4;
      };
      t6(currentTodos);
      setTodos(t6);
    };
    $[1] = todos;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[3] !== t1 || $[4] !== todos[0].title) {
    t2 = <button onClick={t1}>{todos[0].title}</button>;
    $[3] = t1;
    $[4] = todos[0].title;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  return t2;
}
function _temp(todos) {
  const t0 = unstable_copyForUpdate(todos);
  const t1 = unstable_copyForUpdate(t0[0]);
  t0[0] = t1;
  t1.done = true;
  return t0;
}

```
