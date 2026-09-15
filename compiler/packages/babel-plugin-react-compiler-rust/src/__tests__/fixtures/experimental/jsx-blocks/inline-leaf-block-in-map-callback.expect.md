
## Input

```javascript
// @enableJsxBlocks @enableComponentInlining
// Row compiles to a leaf block (its slots never hold JSX), so it is inlined
// into the rendered .map callback: every item becomes a keyed block element
// that React DOM renders without fibers.
function Row({item, selected, onSelect}) {
  return (
    <tr className={selected ? 'danger' : ''}>
      <td className="col-md-1">{item.id}</td>
      <td className="col-md-4">
        <a onClick={() => onSelect(item.id)}>{item.label}</a>
      </td>
    </tr>
  );
}

function Table({items, selectedId, onSelect}) {
  return (
    <table>
      <tbody>
        {items.map(item => (
          <Row
            key={item.id}
            item={item}
            selected={item.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </tbody>
    </table>
  );
}

```

## Code

```javascript
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import { c as _c } from "react/compiler-runtime";
const _BlockTemplate = _createBlockTemplate([
  "tr",
  null,
  [["className", 0]],
  [
    ["td", { className: "col-md-1" }, null, [{ s: 1 }]],
    [
      "td",
      { className: "col-md-4" },
      null,
      [["a", null, [["onClick", 2]], [{ s: 3 }]]],
    ],
  ],
]);
const _BlockTemplate2 = _createBlockTemplate([
  "table",
  null,
  null,
  [["tbody", null, null, [{ s: 0 }]]],
]); // @enableJsxBlocks @enableComponentInlining
// Row compiles to a leaf block (its slots never hold JSX), so it is inlined
// into the rendered .map callback: every item becomes a keyed block element
// that React DOM renders without fibers.
function Row(t0) {
  const $ = _c(10);
  const { item, selected, onSelect } = t0;

  const t1 = selected ? "danger" : "";
  let t2;
  if ($[0] !== item.id || $[1] !== onSelect) {
    t2 = () => onSelect(item.id);
    $[0] = item.id;
    $[1] = onSelect;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== item.id || $[4] !== item.label || $[5] !== t1 || $[6] !== t2) {
    t3 = [t1, item.id, t2, item.label];
    $[3] = item.id;
    $[4] = item.label;
    $[5] = t1;
    $[6] = t2;
    $[7] = t3;
  } else {
    t3 = $[7];
  }
  let t4;
  if ($[8] !== t3) {
    t4 = <_BlockTemplate v={t3} />;
    $[8] = t3;
    $[9] = t4;
  } else {
    t4 = $[9];
  }
  return t4;
}

function Table(t0) {
  const $ = _c(11);
  const { items, selectedId, onSelect } = t0;
  let t1;
  if ($[0] !== items || $[1] !== onSelect || $[2] !== selectedId) {
    let t2;
    if ($[4] !== onSelect || $[5] !== selectedId) {
      t2 = (item) => {
        const item$0 = item;
        const selected = item.id === selectedId;
        const onSelect$0 = onSelect;
        return (
          <_BlockTemplate
            key={item.id}
            v={[
              selected ? "danger" : "",
              item$0.id,
              () => onSelect$0(item$0.id),
              item$0.label,
            ]}
          />
        );
      };
      $[4] = onSelect;
      $[5] = selectedId;
      $[6] = t2;
    } else {
      t2 = $[6];
    }
    t1 = items.map(t2);
    $[0] = items;
    $[1] = onSelect;
    $[2] = selectedId;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  let t2;
  if ($[7] !== t1) {
    t2 = [t1];
    $[7] = t1;
    $[8] = t2;
  } else {
    t2 = $[8];
  }
  let t3;
  if ($[9] !== t2) {
    t3 = <_BlockTemplate2 v={t2} />;
    $[9] = t2;
    $[10] = t3;
  } else {
    t3 = $[10];
  }
  return t3;
}

```
      