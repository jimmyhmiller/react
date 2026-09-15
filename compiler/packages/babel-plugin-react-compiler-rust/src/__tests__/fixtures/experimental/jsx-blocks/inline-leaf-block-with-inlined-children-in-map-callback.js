// @enableJsxBlocks @enableComponentInlining
// Compiled without inlining, Item's slot holds Badge's element, so Item is not
// a leaf block. With Badge inlined, Item is a leaf block, so it is inlined into
// the callback together with Badge, and the list renders without fibers.
function Badge({count}) {
  return <b>{count}</b>;
}

function Item({item}) {
  return (
    <li>
      <span>{item.label}</span>
      <Badge count={item.count} />
    </li>
  );
}

function List({items}) {
  return (
    <ul>
      <li>header</li>
      {items.map(item => (
        <Item key={item.id} item={item} />
      ))}
    </ul>
  );
}
