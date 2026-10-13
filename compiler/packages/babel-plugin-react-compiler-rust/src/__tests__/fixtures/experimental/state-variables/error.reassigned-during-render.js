// @enableStateVariables
function Counter({items}) {
  let count = 0;
  count = items.length;
  return <button onClick={() => count++}>{count}</button>;
}
