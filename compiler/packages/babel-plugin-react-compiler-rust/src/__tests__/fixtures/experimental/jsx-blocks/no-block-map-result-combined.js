// @enableJsxBlocks
// The list is combined with another keyed <li>, whose key could equal an
// item's key, so the items do not become blocks.
function List({items}) {
  const rows = items.map(item => (
    <li key={item.id}>
      <b>{item.label}</b>
    </li>
  ));
  return (
    <ul>
      {[
        ...rows,
        <li key="more">
          <i>more</i>
        </li>,
      ]}
    </ul>
  );
}
