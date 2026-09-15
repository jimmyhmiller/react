
## Input

```javascript
// @enableJsxBlocks @enableComponentInlining @enableListItemMemoization
// Like TodoMVC: Item is inlined into the callback and memoized per item. Its
// slot sometimes holds an EditField element (a component with state, which is
// not inlined); React DOM gives a fiber only to the items that need one.
import {useState} from 'react';

function EditField({initialTitle, onSave}) {
  const [text, setText] = useState(initialTitle);
  return (
    <input
      className="edit"
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={() => onSave(text)}
    />
  );
}

function Item({todo, editing, onToggle, onSave}) {
  let className = '';
  if (todo.completed) {
    className = 'completed';
  }
  if (editing) {
    className += ' editing';
  }
  return (
    <li className={className}>
      <label onClick={() => onToggle(todo.id)}>{todo.title}</label>
      {editing ? (
        <EditField
          initialTitle={todo.title}
          onSave={title => onSave(todo.id, title)}
        />
      ) : null}
    </li>
  );
}

function List({todos, editingId, onToggle, onSave}) {
  return (
    <ul className="todo-list">
      {todos.map(todo => (
        <Item
          key={todo.id}
          todo={todo}
          editing={todo.id === editingId}
          onToggle={onToggle}
          onSave={onSave}
        />
      ))}
    </ul>
  );
}

```

## Code

```javascript
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import {
  c as _c,
  unstable_useListItemMemoCache as useListItemMemoCache,
} from "react/compiler-runtime"; // @enableJsxBlocks @enableComponentInlining @enableListItemMemoization
// Like TodoMVC: Item is inlined into the callback and memoized per item. Its
// slot sometimes holds an EditField element (a component with state, which is
// not inlined); React DOM gives a fiber only to the items that need one.
import { useState } from "react";
const _BlockTemplate = _createBlockTemplate([
  "li",
  null,
  [["className", 0]],
  [["label", null, [["onClick", 1]], [{ s: 2 }]], { s: 3 }],
]);
const _BlockTemplate2 = _createBlockTemplate([
  "ul",
  { className: "todo-list" },
  null,
  [{ s: 0 }],
]);

function EditField(t0) {
  const $ = _c(7);
  const { initialTitle, onSave } = t0;
  const [text, setText] = useState(initialTitle);
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = (e) => setText(e.target.value);
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  let t2;
  if ($[1] !== onSave || $[2] !== text) {
    t2 = () => onSave(text);
    $[1] = onSave;
    $[2] = text;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== t2 || $[5] !== text) {
    t3 = <input className="edit" value={text} onChange={t1} onBlur={t2} />;
    $[4] = t2;
    $[5] = text;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  return t3;
}

function Item(t0) {
  const $ = _c(15);
  const { todo, editing, onToggle, onSave } = t0;
  let className = "";
  if (todo.completed) {
    className = "completed";
  }

  if (editing) {
    className = className + " editing";
  }
  let t1;
  if ($[0] !== onToggle || $[1] !== todo.id) {
    t1 = () => onToggle(todo.id);
    $[0] = onToggle;
    $[1] = todo.id;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if (
    $[3] !== editing ||
    $[4] !== onSave ||
    $[5] !== todo.id ||
    $[6] !== todo.title
  ) {
    t2 = editing ? (
      <EditField
        initialTitle={todo.title}
        onSave={(title) => onSave(todo.id, title)}
      />
    ) : null;
    $[3] = editing;
    $[4] = onSave;
    $[5] = todo.id;
    $[6] = todo.title;
    $[7] = t2;
  } else {
    t2 = $[7];
  }
  let t3;
  if (
    $[8] !== className ||
    $[9] !== t1 ||
    $[10] !== t2 ||
    $[11] !== todo.title
  ) {
    t3 = [className, t1, todo.title, t2];
    $[8] = className;
    $[9] = t1;
    $[10] = t2;
    $[11] = todo.title;
    $[12] = t3;
  } else {
    t3 = $[12];
  }
  let t4;
  if ($[13] !== t3) {
    t4 = <_BlockTemplate v={t3} />;
    $[13] = t3;
    $[14] = t4;
  } else {
    t4 = $[14];
  }
  return t4;
}

function List(t0) {
  const $ = _c(13);
  const _listItemCache = useListItemMemoCache();
  const { todos, editingId, onToggle, onSave } = t0;
  let t1;
  if ($[0] !== _listItemCache || $[1] !== onSave || $[2] !== onToggle) {
    t1 = (todo) => {
      const t5 = todo.id;
      const todo$0 = todo;
      const editing = _listItemCache.is(0, todo.id);
      const onToggle$0 = onToggle;
      const onSave$0 = onSave;
      let className = "";
      if (todo$0.completed) {
        className = "completed";
      }
      if (editing) {
        className = className + " editing";
      }
      const t6 = todo$0.title;
      const t7 = editing ? (
        <EditField
          initialTitle={todo$0.title}
          onSave={(title) => onSave$0(todo$0.id, title)}
        />
      ) : null;
      const $0 = _listItemCache.next(7, t5);
      let t8;
      if (
        $0[0] !== className ||
        $0[1] !== onToggle$0 ||
        $0[2] !== t5 ||
        $0[3] !== t6 ||
        $0[4] !== t7 ||
        $0[5] !== todo$0
      ) {
        t8 = (
          <_BlockTemplate
            key={t5}
            v={[className, () => onToggle$0(todo$0.id), t6, t7]}
          />
        );
        $0[0] = className;
        $0[1] = onToggle$0;
        $0[2] = t5;
        $0[3] = t6;
        $0[4] = t7;
        $0[5] = todo$0;
        $0[6] = t8;
      } else {
        t8 = $0[6];
      }
      return t8;
    };
    $[0] = _listItemCache;
    $[1] = onSave;
    $[2] = onToggle;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  let t2;
  if (
    $[4] !== _listItemCache ||
    $[5] !== editingId ||
    $[6] !== t1 ||
    $[7] !== todos
  ) {
    t2 = _listItemCache.map(todos, t1, [editingId]);
    $[4] = _listItemCache;
    $[5] = editingId;
    $[6] = t1;
    $[7] = todos;
    $[8] = t2;
  } else {
    t2 = $[8];
  }
  let t3;
  if ($[9] !== t2) {
    t3 = [t2];
    $[9] = t2;
    $[10] = t3;
  } else {
    t3 = $[10];
  }
  let t4;
  if ($[11] !== t3) {
    t4 = <_BlockTemplate2 v={t3} />;
    $[11] = t3;
    $[12] = t4;
  } else {
    t4 = $[12];
  }
  return t4;
}

```
      