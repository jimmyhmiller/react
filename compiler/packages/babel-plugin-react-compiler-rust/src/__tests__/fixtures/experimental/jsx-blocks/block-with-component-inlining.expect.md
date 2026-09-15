
## Input

```javascript
// @enableJsxBlocks @enableComponentInlining
function Checkbox({completed, onToggle}) {
  return <span className={completed ? 'on' : 'off'} onClick={onToggle} />;
}

function Title({title}) {
  return <label>{title}</label>;
}

function TodoItem({todo, onToggle}) {
  return (
    <li>
      <div className="view">
        <Checkbox completed={todo.completed} onToggle={onToggle} />
        <Title title={todo.title} />
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
  null,
  [
    [
      "div",
      { className: "view" },
      null,
      [
        [
          "span",
          null,
          [
            ["className", 0],
            ["onClick", 1],
          ],
          [],
        ],
        ["label", null, null, [{ s: 2 }]],
      ],
    ],
  ],
]); // @enableJsxBlocks @enableComponentInlining
function Checkbox(t0) {
  const $ = _c(3);
  const { completed, onToggle } = t0;
  const t1 = completed ? "on" : "off";
  let t2;
  if ($[0] !== onToggle || $[1] !== t1) {
    t2 = <span className={t1} onClick={onToggle} />;
    $[0] = onToggle;
    $[1] = t1;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  return t2;
}

function Title(t0) {
  const $ = _c(2);
  const { title } = t0;
  let t1;
  if ($[0] !== title) {
    t1 = <label>{title}</label>;
    $[0] = title;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

function TodoItem(t0) {
  const $ = _c(6);
  const { todo, onToggle } = t0;

  const completed = todo.completed;
  const onToggle$0 = onToggle;
  const t1 = completed ? "on" : "off";
  const title = todo.title;
  let t2;
  if ($[0] !== onToggle$0 || $[1] !== t1 || $[2] !== title) {
    t2 = [t1, onToggle$0, title];
    $[0] = onToggle$0;
    $[1] = t1;
    $[2] = title;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== t2) {
    t3 = <_BlockTemplate v={t2} />;
    $[4] = t2;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  return t3;
}

```
      