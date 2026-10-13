
## Input

```javascript
// @enableListItemMemoization
// A list of component elements with a selection: selecting an item only calls
// the callback for the previously and newly selected items.
function Row({item, selected}) {
  const [hovered, setHovered] = useState(false);
  return (
    <li className={selected ? 'selected' : ''} onMouseEnter={() => setHovered(true)}>
      {item.label}
      {hovered ? '*' : ''}
    </li>
  );
}

function List({items, selectedId}) {
  return (
    <ul>
      {items.map(item => (
        <Row key={item.id} item={item} selected={item.id === selectedId} />
      ))}
    </ul>
  );
}

```

## Code

```javascript
import {
  c as _c,
  unstable_useListItemMemoCache as useListItemMemoCache,
} from "react/compiler-runtime"; // @enableListItemMemoization
// A list of component elements with a selection: selecting an item only calls
// the callback for the previously and newly selected items.
function Row(t0) {
  const $ = _c(5);
  const { item, selected } = t0;
  const [hovered, setHovered] = useState(false);

  const t1 = selected ? "selected" : "";
  let t2;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = () => setHovered(true);
    $[0] = t2;
  } else {
    t2 = $[0];
  }

  const t3 = hovered ? "*" : "";
  let t4;
  if ($[1] !== item.label || $[2] !== t1 || $[3] !== t3) {
    t4 = (
      <li className={t1} onMouseEnter={t2}>
        {item.label}
        {t3}
      </li>
    );
    $[1] = item.label;
    $[2] = t1;
    $[3] = t3;
    $[4] = t4;
  } else {
    t4 = $[4];
  }
  return t4;
}

function List(t0) {
  const $ = _c(9);
  const _listItemCache = useListItemMemoCache();
  const { items, selectedId } = t0;
  let t1;
  if ($[0] !== _listItemCache) {
    t1 = (item) => {
      const t4 = item.id;
      const t5 = _listItemCache.matchesSelection(0, item.id);
      const $0 = _listItemCache.next(4, t4);
      let t6;
      if ($0[0] !== item || $0[1] !== t4 || $0[2] !== t5) {
        t6 = <Row key={t4} item={item} selected={t5} />;
        $0[0] = item;
        $0[1] = t4;
        $0[2] = t5;
        $0[3] = t6;
      } else {
        t6 = $0[3];
      }
      return t6;
    };
    $[0] = _listItemCache;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if (
    $[2] !== _listItemCache ||
    $[3] !== items ||
    $[4] !== selectedId ||
    $[5] !== t1
  ) {
    t2 = _listItemCache.map(items, t1, [selectedId]);
    $[2] = _listItemCache;
    $[3] = items;
    $[4] = selectedId;
    $[5] = t1;
    $[6] = t2;
  } else {
    t2 = $[6];
  }
  let t3;
  if ($[7] !== t2) {
    t3 = <ul>{t2}</ul>;
    $[7] = t2;
    $[8] = t3;
  } else {
    t3 = $[8];
  }
  return t3;
}

```
      