
## Input

```javascript
// @enableJsxBlocks
function TodoItem({todo, onToggle, onDestroy}) {
  return (
    <li className={todo.completed ? 'completed' : ''}>
      <div className="view">
        <label onDoubleClick={onToggle}>{todo.title}</label>
        <button className="destroy" onClick={onDestroy} />
      </div>
    </li>
  );
}

```

## Code

```javascript
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import { c as _c } from "react/compiler-runtime";
const _BlockTemplate = _createBlockTemplate([
  "li",
  null,
  [["className", 0]],
  [
    [
      "div",
      { className: "view" },
      null,
      [
        ["label", null, [["onDoubleClick", 1]], [{ s: 2 }]],
        ["button", { className: "destroy" }, [["onClick", 3]], []],
      ],
    ],
  ],
]); // @enableJsxBlocks
function TodoItem(t0) {
  const $ = _c(7);
  const { todo, onToggle, onDestroy } = t0;

  const t1 = todo.completed ? "completed" : "";
  let t2;
  if (
    $[0] !== onDestroy ||
    $[1] !== onToggle ||
    $[2] !== t1 ||
    $[3] !== todo.title
  ) {
    t2 = [t1, onToggle, todo.title, onDestroy];
    $[0] = onDestroy;
    $[1] = onToggle;
    $[2] = t1;
    $[3] = todo.title;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  let t3;
  if ($[5] !== t2) {
    t3 = <_BlockTemplate v={t2} />;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  return t3;
}

```
      