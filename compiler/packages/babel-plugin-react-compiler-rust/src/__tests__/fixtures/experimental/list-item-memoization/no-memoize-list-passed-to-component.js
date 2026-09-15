// @enableListItemMemoization
// The list is passed to a component, which could inspect or reorder its
// elements, so its items are not memoized.
function List({items, Layout}) {
  return <Layout>{items.map(item => <b key={item.id}>{item.label}</b>)}</Layout>;
}
