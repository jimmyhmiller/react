// @enableComponentInlining
// The compiler does not memoize inside callbacks, so Item is the per-item
// memoization boundary. Without compiled blocks, inlining it into the .map
// callback would be unobservable but would re-render every item whenever the
// list renders.
function Item({item, selected}) {
  return <li className={selected ? 'selected' : ''}>{item.label}</li>;
}

function List({items, selectedId}) {
  return (
    <ul>
      {items.map(item => (
        <Item key={item.id} item={item} selected={item.id === selectedId} />
      ))}
    </ul>
  );
}

const a = {id: 1, label: 'a'};
const b = {id: 2, label: 'b'};
export const FIXTURE_ENTRYPOINT = {
  fn: List,
  params: [{items: [a, b], selectedId: 1}],
  sequentialRenders: [
    {items: [a, b], selectedId: 1},
    {items: [a, b], selectedId: 2},
    {items: [b, a], selectedId: 2},
    {items: [b], selectedId: 2},
  ],
};
