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
