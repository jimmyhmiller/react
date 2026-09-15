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
