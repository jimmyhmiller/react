// @enableComponentInlining
function Count({n}) {
  return <strong>{n}</strong>;
}

function Summary({items}) {
  return <div>{items.length > 0 && <Count n={items.length} />}</div>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Summary,
  params: [{items: []}],
  sequentialRenders: [{items: []}, {items: [1]}, {items: [1, 2]}, {items: []}],
};
