
## Input

```javascript
// @enableStateVariables
// A mutation of the value of a `let` by a function that runs after render
// updates the state: the mutation is applied to a copy, by an updater. What the
// mutation uses is computed where it was written, and captured.
function Todos() {
  let todos = [];
  let text = '';
  return (
    <>
      <input value={text} onChange={e => (text = e.target.value)} />
      <button
        onClick={() => {
          todos.push({id: todos.length, title: text});
          text = '';
        }}>
        Add
      </button>
      <button onClick={() => { todos.pop(); }}>Undo</button>
      {todos.map(todo => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: Todos,
  params: [{}],
};

```

## Code

```javascript
import { useState } from "react";
import {
  c as _c,
  unstable_copyForUpdate,
  unstable_freezeState,
} from "react/compiler-runtime"; // @enableStateVariables
// A mutation of the value of a `let` by a function that runs after render
// updates the state: the mutation is applied to a copy, by an updater. What the
// mutation uses is computed where it was written, and captured.
function Todos() {
  const $ = _c(14);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const [todos, setTodos] = useState(t0);
  unstable_freezeState(todos);
  const [text, setText] = useState("");
  unstable_freezeState(text);
  let t1;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = (e) => {
      setText(e.target.value);
    };
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== text) {
    t2 = <input value={text} onChange={t1} />;
    $[2] = text;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== text || $[5] !== todos.length) {
    t3 = (
      <button
        onClick={() => {
          const t4 = { id: todos.length, title: text };
          setTodos((todos$0) => {
            const t5 = unstable_copyForUpdate(todos$0);
            t5.push(t4);
            return t5;
          });
          setText("");
        }}
      >
        Add
      </button>
    );
    $[4] = text;
    $[5] = todos.length;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  let t4;
  if ($[7] === Symbol.for("react.memo_cache_sentinel")) {
    t4 = (
      <button
        onClick={() => {
          setTodos(_temp);
        }}
      >
        Undo
      </button>
    );
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  let t5;
  if ($[8] !== todos) {
    t5 = todos.map(_temp2);
    $[8] = todos;
    $[9] = t5;
  } else {
    t5 = $[9];
  }
  let t6;
  if ($[10] !== t2 || $[11] !== t3 || $[12] !== t5) {
    t6 = (
      <>
        {t2}
        {t3}
        {t4}
        {t5}
      </>
    );
    $[10] = t2;
    $[11] = t3;
    $[12] = t5;
    $[13] = t6;
  } else {
    t6 = $[13];
  }
  return t6;
}
function _temp2(todo) {
  return <li key={todo.id}>{todo.title}</li>;
}
function _temp(todos) {
  const t0 = unstable_copyForUpdate(todos);
  t0.pop();
  return t0;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Todos,
  params: [{}],
};

```
