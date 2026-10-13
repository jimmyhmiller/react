// @enableStateVariables
function Counter() {
  const increment = () => {
    count++;
  };
  let count = 0;
  return <button onClick={increment}>{count}</button>;
}
