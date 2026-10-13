
## Input

```javascript
// @enableStateVariables
// Several state variables, written by handlers declared in the component and
// in a rendered list.
function Todos({initial}) {
  let text = '';
  let todos = initial;
  const add = () => {
    todos = [...todos, {id: todos.length, title: text}];
    text = '';
  };
  return (
    <>
      <input value={text} onChange={e => (text = e.target.value)} />
      <button onClick={add}>Add</button>
      <ul>
        {todos.map(todo => (
          <li
            key={todo.id}
            onClick={() => {
              todos = todos.filter(other => other !== todo);
            }}>
            {todo.title}
          </li>
        ))}
      </ul>
    </>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: Todos,
  params: [{initial: [{id: 0, title: 'one'}]}],
};

```

## Code

```javascript
import { useState } from "react";
import { c as _c, unstable_freezeState } from "react/compiler-runtime"; // @enableStateVariables
// Several state variables, written by handlers declared in the component and
// in a rendered list.
function Todos(t0) {
  const $ = _c(15);
  const { initial } = t0;
  const [text, setText] = useState("");
  unstable_freezeState(text);
  const [todos, setTodos] = useState(initial);
  unstable_freezeState(todos);
  let t1;
  if ($[0] !== text) {
    t1 = () => {
      setTodos((todos$0) => [...todos$0, { id: todos$0.length, title: text }]);
      setText("");
    };
    $[0] = text;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const add = t1;
  let t2;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = (e) => {
      setText(e.target.value);
    };
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== text) {
    t3 = <input value={text} onChange={t2} />;
    $[3] = text;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  let t4;
  if ($[5] !== add) {
    t4 = <button onClick={add}>Add</button>;
    $[5] = add;
    $[6] = t4;
  } else {
    t4 = $[6];
  }
  let t5;
  if ($[7] !== todos) {
    t5 = todos.map((todo) => (
      <li
        key={todo.id}
        onClick={() => {
          setTodos(todos.filter((other) => other !== todo));
        }}
      >
        {todo.title}
      </li>
    ));
    $[7] = todos;
    $[8] = t5;
  } else {
    t5 = $[8];
  }
  let t6;
  if ($[9] !== t5) {
    t6 = <ul>{t5}</ul>;
    $[9] = t5;
    $[10] = t6;
  } else {
    t6 = $[10];
  }
  let t7;
  if ($[11] !== t3 || $[12] !== t4 || $[13] !== t6) {
    t7 = (
      <>
        {t3}
        {t4}
        {t6}
      </>
    );
    $[11] = t3;
    $[12] = t4;
    $[13] = t6;
    $[14] = t7;
  } else {
    t7 = $[14];
  }
  return t7;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Todos,
  params: [{ initial: [{ id: 0, title: "one" }] }],
};

```
