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
