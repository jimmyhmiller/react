// @enableStateVariables @gating
function Counter() {
  let count = 0;
  return <button onClick={() => count++}>{count}</button>;
}
