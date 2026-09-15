// @enableJsxBlocks @enableListItemMemoization
// `selectedId` is compared inside an event handler, which runs after the render
// and must read the value of the render that created it, so it is not a
// selection. The list is still memoized per item.
function List({items, selectedId, onPick}) {
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>
          <b onClick={() => onPick(item.id === selectedId)}>{item.label}</b>
        </li>
      ))}
    </ul>
  );
}
