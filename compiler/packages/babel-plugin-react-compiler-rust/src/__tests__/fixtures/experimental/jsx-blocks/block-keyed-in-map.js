// @enableJsxBlocks
function List({items}) {
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>
          <b>{item.name}</b>
        </li>
      ))}
    </ul>
  );
}
