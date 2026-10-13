// @enableStateVariables
function Counter({show}) {
  if (!show) {
    return null;
  }
  let count = 0;
  return <button onClick={() => count++}>{count}</button>;
}
