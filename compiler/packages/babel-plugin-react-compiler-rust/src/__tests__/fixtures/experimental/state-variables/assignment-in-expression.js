// @enableStateVariables
// An assignment that is part of an expression: the call of the setter joins
// the expression, and the value of the assignment is what was assigned.
function Counter({enabled, onChange}) {
  let count = 0;
  return (
    <>
      <button onClick={() => { enabled && (count = 5); }}>set</button>
      <button onClick={() => { enabled ? count++ : count--; }}>step</button>
      <button onClick={() => onChange((count = count * 2))}>double</button>
      {count}
    </>
  );
}
