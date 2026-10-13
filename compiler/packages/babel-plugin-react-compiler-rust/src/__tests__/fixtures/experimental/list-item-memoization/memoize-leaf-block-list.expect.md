
## Input

```javascript
// @enableJsxBlocks @enableComponentInlining @enableListItemMemoization
// Each row of the list is memoized separately, in a memo cache per item
// provided by unstable_useListItemMemoCache. `selectedId` is only compared with
// `===`, so it is a selection: the callback reads it through
// `listItemCache.is` and the list is mapped by `listItemCache.map`.
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
import {
  c as _c,
  unstable_useListItemMemoCache as useListItemMemoCache,
} from "react/compiler-runtime";
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
]); // @enableJsxBlocks @enableComponentInlining @enableListItemMemoization
// Each row of the list is memoized separately, in a memo cache per item
// provided by unstable_useListItemMemoCache. `selectedId` is only compared with
// `===`, so it is a selection: the callback reads it through
// `listItemCache.is` and the list is mapped by `listItemCache.map`.
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
  const $ = _c(12);
  const _listItemCache = useListItemMemoCache();
  const { items, selectedId, onSelect } = t0;
  let t1;
  if ($[0] !== _listItemCache || $[1] !== onSelect) {
    t1 = (item) => {
      const t5 = item.id;
      const item$0 = item;
      const selected = _listItemCache.matchesSelection(0, item.id);
      const onSelect$0 = onSelect;
      const t6 = selected ? "danger" : "";
      const t7 = item$0.id;
      const t8 = item$0.label;
      const $0 = _listItemCache.next(7, t5);
      let t9;
      if (
        $0[0] !== item$0 ||
        $0[1] !== onSelect$0 ||
        $0[2] !== t5 ||
        $0[3] !== t6 ||
        $0[4] !== t7 ||
        $0[5] !== t8
      ) {
        t9 = (
          <_BlockTemplate
            key={t5}
            v={[t6, t7, () => onSelect$0(item$0.id), t8]}
          />
        );
        $0[0] = item$0;
        $0[1] = onSelect$0;
        $0[2] = t5;
        $0[3] = t6;
        $0[4] = t7;
        $0[5] = t8;
        $0[6] = t9;
      } else {
        t9 = $0[6];
      }
      return t9;
    };
    $[0] = _listItemCache;
    $[1] = onSelect;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if (
    $[3] !== _listItemCache ||
    $[4] !== items ||
    $[5] !== selectedId ||
    $[6] !== t1
  ) {
    t2 = _listItemCache.map(items, t1, [selectedId]);
    $[3] = _listItemCache;
    $[4] = items;
    $[5] = selectedId;
    $[6] = t1;
    $[7] = t2;
  } else {
    t2 = $[7];
  }
  let t3;
  if ($[8] !== t2) {
    t3 = [t2];
    $[8] = t2;
    $[9] = t3;
  } else {
    t3 = $[9];
  }
  let t4;
  if ($[10] !== t3) {
    t4 = <_BlockTemplate2 v={t3} />;
    $[10] = t3;
    $[11] = t4;
  } else {
    t4 = $[11];
  }
  return t4;
}

```
      