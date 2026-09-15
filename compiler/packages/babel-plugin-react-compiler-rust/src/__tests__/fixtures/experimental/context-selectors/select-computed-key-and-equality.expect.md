
## Input

```javascript
// @enableContextSelectors
// `starred[card.id]` selects a computed path, and `card.id === selectedId`
// selects the result of the comparison: the card renders when it is selected or
// deselected, not when another card is.
import {createContext, useContext} from 'react';

const BoardContext = createContext(null);

function Card({card}) {
  const {selectedId, starred} = useContext(BoardContext);
  const isSelected = card.id === selectedId;
  const isNotStarred = starred[card.id] !== true;
  return (
    <li className={isSelected ? 'selected' : ''}>
      {card.title}
      {isNotStarred ? null : '★'}
    </li>
  );
}

```

## Code

```javascript
import { c as _c, unstable_useContextPaths } from "react/compiler-runtime"; // @enableContextSelectors
// `starred[card.id]` selects a computed path, and `card.id === selectedId`
// selects the result of the comparison: the card renders when it is selected or
// deselected, not when another card is.
import { createContext, useContext } from "react";

const BoardContext = createContext(null);

function Card(t0) {
  const $ = _c(6);
  const { card } = t0;
  let t1;
  if ($[0] !== card.id) {
    t1 = [
      [1, true, "starred", card.id],
      [1, card.id, "selectedId"],
    ];
    $[0] = card.id;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const { selectedId, starred } = unstable_useContextPaths(BoardContext, t1);
  const isSelected = card.id === selectedId;
  const isNotStarred = starred[card.id] !== true;

  const t2 = isSelected ? "selected" : "";

  const t3 = isNotStarred ? null : "\u2605";
  let t4;
  if ($[2] !== card.title || $[3] !== t2 || $[4] !== t3) {
    t4 = (
      <li className={t2}>
        {card.title}
        {t3}
      </li>
    );
    $[2] = card.title;
    $[3] = t2;
    $[4] = t3;
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  return t4;
}

```
      