// @enableStateVariables
function List({item}) {
  let items = [];
  return (
    <button
      onClick={() => {
        items.push?.(item);
      }}>
      {items.length}
    </button>
  );
}
