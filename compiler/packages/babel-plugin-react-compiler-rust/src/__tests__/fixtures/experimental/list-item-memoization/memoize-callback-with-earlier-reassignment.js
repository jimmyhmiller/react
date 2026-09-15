// @enableJsxBlocks @enableListItemMemoization
// The callback reassigns a variable before it creates the element, so the
// element's allocations can move right before the return: the list is
// memoized per item, and the reassigned variable is a dependency.
function List({items}) {
  return (
    <div>
      <h1>items</h1>
      {items.map(item => {
        let label = item.label;
        if (item.important) {
          label = label.toUpperCase();
        }
        return (
          <p key={item.id}>
            <b>{label}</b>
          </p>
        );
      })}
    </div>
  );
}
