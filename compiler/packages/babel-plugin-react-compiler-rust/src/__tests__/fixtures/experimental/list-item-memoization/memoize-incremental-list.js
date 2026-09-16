// @enableListItemMemoization @enableIncrementalListMapping
// A one-parameter callback cannot observe shifted indices or the source array,
// so unchanged prefixes and suffixes can reuse their previous mapped results.
function List({items}) {
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>{item.label}</li>
      ))}
    </ul>
  );
}
