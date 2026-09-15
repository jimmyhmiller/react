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
