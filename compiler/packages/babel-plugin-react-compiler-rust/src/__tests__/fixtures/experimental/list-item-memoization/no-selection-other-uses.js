// @enableJsxBlocks @enableListItemMemoization
// `selectedId` is rendered as well as compared, `loose` is compared with `==`,
// and `a` and `b` are compared with each other: none of them is a selection.
function List({items, selectedId, loose, a, b}) {
  return (
    <ul>
      {items.map(item => (
        <li
          key={item.id}
          className={item.id === selectedId ? 'selected' : ''}
          title={item.id == loose ? 'loose' : ''}>
          <b>{selectedId}</b>
          <i>{a === b ? item.label : ''}</i>
        </li>
      ))}
    </ul>
  );
}
