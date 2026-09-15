// @enableContextSelectors
// The hook call is part of an expression (a value block), which cannot contain
// the statements the rewrite adds, so it is not selected.
function Component(props) {
  const {data} = usePagination(props.id).items ?? {data: []};
  return <ul>{data.map(item => <li key={item.id}>{item.label}</li>)}</ul>;
}
