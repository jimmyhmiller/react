
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
  const $ = _c(17);
  const { initial } = t0;
  const [text, setText] = useState("");
  unstable_freezeState(text);
  const t1 = initial;
  let t2;
  if ($[0] !== t1) {
    t2 = () => t1;
    $[0] = t1;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  const [todos, setTodos] = useState(t2);
  unstable_freezeState(todos);
  let t3;
  if ($[2] !== text) {
    t3 = () => {
      setTodos((todos$0) => [...todos$0, { id: todos$0.length, title: text }]);
      setText("");
    };
    $[2] = text;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  const add = t3;
  let t4;
  if ($[4] === Symbol.for("react.memo_cache_sentinel")) {
    t4 = (e) => {
      const t5 = e.target.value;
      setText(() => t5);
    };
    $[4] = t4;
  } else {
    t4 = $[4];
  }
  let t5;
  if ($[5] !== text) {
    t5 = <input value={text} onChange={t4} />;
    $[5] = text;
    $[6] = t5;
  } else {
    t5 = $[6];
  }
  let t6;
  if ($[7] !== add) {
    t6 = <button onClick={add}>Add</button>;
    $[7] = add;
    $[8] = t6;
  } else {
    t6 = $[8];
  }
  let t7;
  if ($[9] !== todos) {
    t7 = todos.map((todo) => (
      <li
        key={todo.id}
        onClick={() => {
          const t8 = todos.filter((other) => other !== todo);
          setTodos(() => t8);
        }}
      >
        {todo.title}
      </li>
    ));
    $[9] = todos;
    $[10] = t7;
  } else {
    t7 = $[10];
  }
  let t8;
  if ($[11] !== t7) {
    t8 = <ul>{t7}</ul>;
    $[11] = t7;
    $[12] = t8;
  } else {
    t8 = $[12];
  }
  let t9;
  if ($[13] !== t5 || $[14] !== t6 || $[15] !== t8) {
    t9 = (
      <>
        {t5}
        {t6}
        {t8}
      </>
    );
    $[13] = t5;
    $[14] = t6;
    $[15] = t8;
    $[16] = t9;
  } else {
    t9 = $[16];
  }
  return t9;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Todos,
  params: [{ initial: [{ id: 0, title: "one" }] }],
};

```
