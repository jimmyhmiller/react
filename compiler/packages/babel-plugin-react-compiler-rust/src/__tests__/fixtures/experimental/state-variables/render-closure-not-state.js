// @enableStateVariables
// A variable that is only reassigned during render is not state.
function Total({items}) {
  let total = 0;
  items.forEach(item => {
    total += item.price;
  });
  return <span>{total}</span>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Total,
  params: [{items: [{price: 1}, {price: 2}]}],
};
