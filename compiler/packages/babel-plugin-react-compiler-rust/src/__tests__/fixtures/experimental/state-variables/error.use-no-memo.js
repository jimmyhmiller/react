// @enableStateVariables
function Counter() {
  'use no memo';
  let count = 0;
  return <button onClick={() => count++}>{count}</button>;
}
