
## Input

```javascript
// @enableStateVariables
// The compiler can only turn a modification into an update when it can tell
// what is modified. `find` returns some item: modifying it would modify the
// state in place, which React would never render. `unstable_freezeState`
// freezes the state in development, so that this throws instead.
function Todos({id}) {
  let todos = [{id: 0, done: false}];
  return (
    <button
      onClick={() => {
        todos.push({id: 1, done: false});
        todos.find(todo => todo.id === id).done = true;
      }}>
      {todos.length}
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
// The compiler can only turn a modification into an update when it can tell
// what is modified. `find` returns some item: modifying it would modify the
// state in place, which React would never render. `unstable_freezeState`
// freezes the state in development, so that this throws instead.
function Todos(t0) {
  const $ = _c(7);
  const { id } = t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = [{ id: 0, done: false }];
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const [todos, setTodos] = useState(t1);
  unstable_freezeState(todos);
  let t2;
  if ($[1] !== id || $[2] !== todos) {
    t2 = () => {
      let currentTodos = todos;
      const t3 = { id: 1, done: false };
      const t5 = (todos$0) => {
        const t4 = unstable_copyForUpdate(todos$0);
        t4.push(t3);
        return t4;
      };
      currentTodos = t5(currentTodos);
      setTodos(t5);
      currentTodos.find((todo) => todo.id === id).done = true;
    };
    $[1] = id;
    $[2] = todos;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== t2 || $[5] !== todos.length) {
    t3 = <button onClick={t2}>{todos.length}</button>;
    $[4] = t2;
    $[5] = todos.length;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  return t3;
}

```
