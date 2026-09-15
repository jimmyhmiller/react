
## Input

```javascript
// @enableListItemMemoization
// Without blocks: the list of component elements is only rendered, so each
// item's element is memoized. When the column re-renders, unchanged cards get
// the same element and React bails out of rendering them. The key read from a
// parameter is passed to `next` so that moved items keep their caches.
function Card({cardId, onOpen}) {
  const [open, setOpen] = useState(false);
  return (
    <li onClick={() => (setOpen(!open), onOpen(cardId))}>
      {cardId} {open ? 'open' : 'closed'}
    </li>
  );
}

function Column({title, cardIds, onOpen}) {
  return (
    <section>
      <h2>{title}</h2>
      <ul>
        {cardIds.map(id => (
          <Card key={id} cardId={id} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}

```

## Code

```javascript
import {
  c as _c,
  unstable_useListItemMemoCache as useListItemMemoCache,
} from "react/compiler-runtime"; // @enableListItemMemoization
// Without blocks: the list of component elements is only rendered, so each
// item's element is memoized. When the column re-renders, unchanged cards get
// the same element and React bails out of rendering them. The key read from a
// parameter is passed to `next` so that moved items keep their caches.
function Card(t0) {
  const $ = _c(8);
  const { cardId, onOpen } = t0;
  const [open, setOpen] = useState(false);
  let t1;
  if ($[0] !== cardId || $[1] !== onOpen || $[2] !== open) {
    t1 = () => (setOpen(!open), onOpen(cardId));
    $[0] = cardId;
    $[1] = onOpen;
    $[2] = open;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  const t2 = open ? "open" : "closed";
  let t3;
  if ($[4] !== cardId || $[5] !== t1 || $[6] !== t2) {
    t3 = (
      <li onClick={t1}>
        {cardId} {t2}
      </li>
    );
    $[4] = cardId;
    $[5] = t1;
    $[6] = t2;
    $[7] = t3;
  } else {
    t3 = $[7];
  }
  return t3;
}

function Column(t0) {
  const $ = _c(12);
  const _listItemCache = useListItemMemoCache();
  const { title, cardIds, onOpen } = t0;
  let t1;
  if ($[0] !== title) {
    t1 = <h2>{title}</h2>;
    $[0] = title;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== cardIds || $[3] !== onOpen) {
    let t3;
    if ($[5] !== onOpen) {
      t3 = (id) => {
        const $0 = _listItemCache.next(3, id);
        let t5;
        if ($0[0] !== id || $0[1] !== onOpen) {
          t5 = <Card key={id} cardId={id} onOpen={onOpen} />;
          $0[0] = id;
          $0[1] = onOpen;
          $0[2] = t5;
        } else {
          t5 = $0[2];
        }
        return t5;
      };
      $[5] = onOpen;
      $[6] = t3;
    } else {
      t3 = $[6];
    }
    t2 = cardIds.map(t3);
    $[2] = cardIds;
    $[3] = onOpen;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  let t3;
  if ($[7] !== t2) {
    t3 = <ul>{t2}</ul>;
    $[7] = t2;
    $[8] = t3;
  } else {
    t3 = $[8];
  }
  let t4;
  if ($[9] !== t1 || $[10] !== t3) {
    t4 = (
      <section>
        {t1}
        {t3}
      </section>
    );
    $[9] = t1;
    $[10] = t3;
    $[11] = t4;
  } else {
    t4 = $[11];
  }
  return t4;
}

```
      