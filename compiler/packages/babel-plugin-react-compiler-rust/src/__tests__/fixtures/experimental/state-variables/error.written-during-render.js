// @enableStateVariables
function Counter() {
  let count = 0;
  const increment = () => {
    count++;
  };
  increment();
  return <button onClick={increment}>{count}</button>;
}
