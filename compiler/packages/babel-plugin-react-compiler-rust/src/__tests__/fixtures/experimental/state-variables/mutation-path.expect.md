
## Input

```javascript
// @enableStateVariables
// Each value on the path to the mutated one is copied, and nothing else: the
// other properties and items keep their identity.
function Profile({city}) {
  let user = {name: 'Ada', address: {city: 'London', zip: 'N1'}, tags: new Set()};
  let todos = [{id: 0, done: false}];
  return (
    <>
      <button onClick={() => { user.address.city = city; }}>move</button>
      <button onClick={() => { delete user.name; }}>forget</button>
      <button onClick={() => { user.tags.add(city); }}>tag</button>
      {todos.map((todo, i) => (
        <input
          key={todo.id}
          type="checkbox"
          checked={todo.done}
          onChange={() => { todos[i].done = !todos[i].done; }}
        />
      ))}
      {user.name} {user.address.city}
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
// Each value on the path to the mutated one is copied, and nothing else: the
// other properties and items keep their identity.
function Profile(t0) {
  const $ = _c(15);
  const { city } = t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = {
      name: "Ada",
      address: { city: "London", zip: "N1" },
      tags: new Set(),
    };
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const [user, setUser] = useState(t1);
  unstable_freezeState(user);
  let t2;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = [{ id: 0, done: false }];
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  const [todos, setTodos] = useState(t2);
  unstable_freezeState(todos);
  let t3;
  if ($[2] !== city) {
    t3 = (
      <button
        onClick={() => {
          setUser((user$0) => {
            const t4 = unstable_copyForUpdate(user$0);
            const t5 = unstable_copyForUpdate(t4.address);
            t4.address = t5;
            t5.city = city;
            return t4;
          });
        }}
      >
        move
      </button>
    );
    $[2] = city;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  let t4;
  if ($[4] === Symbol.for("react.memo_cache_sentinel")) {
    t4 = (
      <button
        onClick={() => {
          setUser(_temp);
        }}
      >
        forget
      </button>
    );
    $[4] = t4;
  } else {
    t4 = $[4];
  }
  let t5;
  if ($[5] !== city) {
    t5 = (
      <button
        onClick={() => {
          setUser((user$0) => {
            const t6 = unstable_copyForUpdate(user$0);
            const t7 = unstable_copyForUpdate(t6.tags);
            t6.tags = t7;
            t7.add(city);
            return t6;
          });
        }}
      >
        tag
      </button>
    );
    $[5] = city;
    $[6] = t5;
  } else {
    t5 = $[6];
  }
  let t6;
  if ($[7] !== todos) {
    t6 = todos.map((todo, i) => (
      <input
        key={todo.id}
        type="checkbox"
        checked={todo.done}
        onChange={() => {
          const t7 = !todos[i].done;
          setTodos((todos$0) => {
            const t8 = unstable_copyForUpdate(todos$0);
            const t9 = unstable_copyForUpdate(t8[i]);
            t8[i] = t9;
            t9.done = t7;
            return t8;
          });
        }}
      />
    ));
    $[7] = todos;
    $[8] = t6;
  } else {
    t6 = $[8];
  }
  let t7;
  if (
    $[9] !== t3 ||
    $[10] !== t5 ||
    $[11] !== t6 ||
    $[12] !== user.address.city ||
    $[13] !== user.name
  ) {
    t7 = (
      <>
        {t3}
        {t4}
        {t5}
        {t6}
        {user.name} {user.address.city}
      </>
    );
    $[9] = t3;
    $[10] = t5;
    $[11] = t6;
    $[12] = user.address.city;
    $[13] = user.name;
    $[14] = t7;
  } else {
    t7 = $[14];
  }
  return t7;
}
function _temp(user) {
  const t0 = unstable_copyForUpdate(user);
  delete t0.name;
  return t0;
}

```
