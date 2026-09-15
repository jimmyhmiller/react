// @enableJsxBlocks @enableComponentInlining
// The result of .map is passed to a component instead of being rendered, so
// the callback's items are not rendered positions.
function Row({item}) {
  return (
    <li>
      <span>{item.label}</span>
    </li>
  );
}

function List({items, Wrapper}) {
  const rows = items.map(item => <Row key={item.id} item={item} />);
  return <Wrapper rows={rows} />;
}
