// @enableListItemMemoization
// The list is also read (its length), not only rendered, so its items are not
// memoized.
function List({items}) {
  const rows = items.map(item => <li key={item.id}>{item.label}</li>);
  return (
    <div>
      <span>{rows.length}</span>
      <ul>{rows}</ul>
    </div>
  );
}
