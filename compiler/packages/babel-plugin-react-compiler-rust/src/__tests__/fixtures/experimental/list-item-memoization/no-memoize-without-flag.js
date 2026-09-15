// @enableJsxBlocks
// Without enableListItemMemoization, list callbacks are not memoized per item.
function List({items}) {
  return (
    <div>
      <h1>items</h1>
      {items.map(item => (
        <p key={item.id}>
          <b>{item.label}</b>
        </p>
      ))}
    </div>
  );
}
