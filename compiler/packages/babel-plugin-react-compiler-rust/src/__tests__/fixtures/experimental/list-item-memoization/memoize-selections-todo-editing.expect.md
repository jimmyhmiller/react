
## Input

```javascript
// @enableJsxBlocks @enableComponentInlining @enableListItemMemoization
// `editingId` is compared with `===` and `hiddenId` with `!==`; both are
// selections. The comparison results are used in several places, including a
// slot that holds a component element.
function EditField({title}) {
  return <input className="edit" defaultValue={title} />;
}

function TodoList({todos, editingId, hiddenId, onToggle}) {
  return (
    <ul className="todo-list">
      {todos.map(todo => {
        const editing = todo.id === editingId;
        const visible = todo.id !== hiddenId;
        let className = todo.completed ? 'completed' : '';
        if (editing) {
          className += ' editing';
        }
        return (
          <li key={todo.id} className={className} hidden={!visible}>
            <label onClick={() => onToggle(todo.id)}>{todo.title}</label>
            {editing ? <EditField title={todo.title} /> : null}
          </li>
        );
      })}
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
} from "react/compiler-runtime";
const _BlockTemplate = _createBlockTemplate([
  "ul",
  { className: "todo-list" },
  null,
  [{ s: 0 }],
]);
const _BlockTemplate2 = _createBlockTemplate([
  "li",
  null,
  [
    ["className", 0],
    ["hidden", 1],
  ],
  [["label", null, [["onClick", 2]], [{ s: 3 }]], { s: 4 }],
]); // @enableJsxBlocks @enableComponentInlining @enableListItemMemoization
// `editingId` is compared with `===` and `hiddenId` with `!==`; both are
// selections. The comparison results are used in several places, including a
// slot that holds a component element.
function EditField(t0) {
  const $ = _c(2);
  const { title } = t0;
  let t1;
  if ($[0] !== title) {
    t1 = <input className="edit" defaultValue={title} />;
    $[0] = title;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

function TodoList(t0) {
  const $ = _c(13);
  const _listItemCache = useListItemMemoCache();
  const { todos, editingId, hiddenId, onToggle } = t0;
  let t1;
  if ($[0] !== _listItemCache || $[1] !== onToggle) {
    t1 = (todo) => {
      const editing = _listItemCache.is(0, todo.id);
      const visible = !_listItemCache.is(1, todo.id);
      let className = todo.completed ? "completed" : "";
      if (editing) {
        className = className + " editing";
      }

      const t5 = todo.id;
      const t6 = !visible;
      const t7 = todo.title;
      const t8 = editing ? <EditField title={todo.title} /> : null;
      const $0 = _listItemCache.next(8, t5);
      let t9;
      if (
        $0[0] !== className ||
        $0[1] !== onToggle ||
        $0[2] !== t5 ||
        $0[3] !== t6 ||
        $0[4] !== t7 ||
        $0[5] !== t8 ||
        $0[6] !== todo
      ) {
        t9 = (
          <_BlockTemplate2
            key={t5}
            v={[className, t6, () => onToggle(todo.id), t7, t8]}
          />
        );
        $0[0] = className;
        $0[1] = onToggle;
        $0[2] = t5;
        $0[3] = t6;
        $0[4] = t7;
        $0[5] = t8;
        $0[6] = todo;
        $0[7] = t9;
      } else {
        t9 = $0[7];
      }
      return t9;
    };
    $[0] = _listItemCache;
    $[1] = onToggle;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if (
    $[3] !== _listItemCache ||
    $[4] !== editingId ||
    $[5] !== hiddenId ||
    $[6] !== t1 ||
    $[7] !== todos
  ) {
    t2 = _listItemCache.map(todos, t1, [editingId, hiddenId]);
    $[3] = _listItemCache;
    $[4] = editingId;
    $[5] = hiddenId;
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
    t4 = <_BlockTemplate v={t3} />;
    $[11] = t3;
    $[12] = t4;
  } else {
    t4 = $[12];
  }
  return t4;
}

```
      