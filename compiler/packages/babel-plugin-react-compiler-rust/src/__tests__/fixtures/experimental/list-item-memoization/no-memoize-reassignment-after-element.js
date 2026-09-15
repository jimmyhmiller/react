// @enableJsxBlocks @enableListItemMemoization
// A variable is reassigned after the element is created. Moving the element's
// allocations right before the return would read the reassigned value, so the
// list is not memoized per item.
function List({items}) {
  return (
    <div>
      <h1>items</h1>
      {items.map(item => {
        let label = item.label;
        const element = (
          <p key={item.id}>
            <b>{label}</b>
          </p>
        );
        label = label.toUpperCase();
        return element;
      })}
    </div>
  );
}
