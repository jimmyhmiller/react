
## Input

```javascript
// @enableJsxBlocks @enableListItemMemoization
// With blocks: the column is a block and the list of component elements is
// rendered by one of its slots and used nowhere else, so each item's element
// is memoized like a list at a fixed position.
import {useState} from 'react';

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
      <h2>
        {title} <span className="count">{cardIds.length}</span>
      </h2>
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
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import {
  c as _c,
  unstable_useListItemMemoCache as useListItemMemoCache,
} from "react/compiler-runtime"; // @enableJsxBlocks @enableListItemMemoization
// With blocks: the column is a block and the list of component elements is
// rendered by one of its slots and used nowhere else, so each item's element
// is memoized like a list at a fixed position.
import { useState } from "react";
const _BlockTemplate = _createBlockTemplate([
  "section",
  null,
  null,
  [
    [
      "h2",
      null,
      null,
      [{ s: 0 }, " ", ["span", { className: "count" }, null, [{ s: 1 }]]],
    ],
    ["ul", null, null, [{ s: 2 }]],
  ],
]);

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
  const $ = _c(11);
  const _listItemCache = useListItemMemoCache();
  const { title, cardIds, onOpen } = t0;

  const t1 = cardIds.length;
  let t2;
  if ($[0] !== cardIds || $[1] !== onOpen) {
    let t3;
    if ($[3] !== onOpen) {
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
      $[3] = onOpen;
      $[4] = t3;
    } else {
      t3 = $[4];
    }
    t2 = cardIds.map(t3);
    $[0] = cardIds;
    $[1] = onOpen;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[5] !== cardIds.length || $[6] !== t2 || $[7] !== title) {
    t3 = [title, t1, t2];
    $[5] = cardIds.length;
    $[6] = t2;
    $[7] = title;
    $[8] = t3;
  } else {
    t3 = $[8];
  }
  let t4;
  if ($[9] !== t3) {
    t4 = <_BlockTemplate v={t3} />;
    $[9] = t3;
    $[10] = t4;
  } else {
    t4 = $[10];
  }
  return t4;
}

```
      