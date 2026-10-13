
## Input

```javascript
// @enableJsxBlocks @enableListItemMemoization
// Two selections, one compared twice and one compared only when the first
// matches. Each comparison is recorded for the item that makes it.
function Tree({nodes, openGroup, activeId}) {
  return (
    <ul>
      {nodes.map(node => {
        const open = node.group === openGroup;
        const active = open && node.id === activeId;
        const alias = node.alias === activeId;
        return (
          <li key={node.id} className={active || alias ? 'active' : ''}>
            <b>{open ? node.label : '...'}</b>
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
const _BlockTemplate = _createBlockTemplate(["ul", null, null, [{ s: 0 }]]);
const _BlockTemplate2 = _createBlockTemplate([
  "li",
  null,
  [["className", 0]],
  [["b", null, null, [{ s: 1 }]]],
]); // @enableJsxBlocks @enableListItemMemoization
// Two selections, one compared twice and one compared only when the first
// matches. Each comparison is recorded for the item that makes it.
function Tree(t0) {
  const $ = _c(12);
  const _listItemCache = useListItemMemoCache();
  const { nodes, openGroup, activeId } = t0;
  let t1;
  if ($[0] !== _listItemCache) {
    t1 = (node) => {
      const open = _listItemCache.matchesSelection(0, node.group);
      const active = open && _listItemCache.matchesSelection(1, node.id);
      const alias = _listItemCache.matchesSelection(1, node.alias);

      const t5 = node.id;
      const t6 = active || alias ? "active" : "";
      const t7 = open ? node.label : "...";
      const $0 = _listItemCache.next(4, t5);
      let t8;
      if ($0[0] !== t5 || $0[1] !== t6 || $0[2] !== t7) {
        t8 = <_BlockTemplate2 key={t5} v={[t6, t7]} />;
        $0[0] = t5;
        $0[1] = t6;
        $0[2] = t7;
        $0[3] = t8;
      } else {
        t8 = $0[3];
      }
      return t8;
    };
    $[0] = _listItemCache;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if (
    $[2] !== _listItemCache ||
    $[3] !== activeId ||
    $[4] !== nodes ||
    $[5] !== openGroup ||
    $[6] !== t1
  ) {
    t2 = _listItemCache.map(nodes, t1, [openGroup, activeId]);
    $[2] = _listItemCache;
    $[3] = activeId;
    $[4] = nodes;
    $[5] = openGroup;
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
    t4 = <_BlockTemplate v={t3} />;
    $[10] = t3;
    $[11] = t4;
  } else {
    t4 = $[11];
  }
  return t4;
}

```
      