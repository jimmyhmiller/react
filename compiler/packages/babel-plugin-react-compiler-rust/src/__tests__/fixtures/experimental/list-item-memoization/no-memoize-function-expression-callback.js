// @enableJsxBlocks @enableListItemMemoization
// Only arrow functions are memoized: a function expression has its own `this`
// and `arguments`.
function List({items}) {
  return (
    <div>
      <h1>items</h1>
      {items.map(function (item) {
        return (
          <p key={item.id}>
            <b>{item.label}</b>
          </p>
        );
      })}
    </div>
  );
}
