// @enableStateVariables
// An updater captures what it does not compute from the state: a variable that
// is never reassigned (`step`), the value of another state variable in this
// render (`factor`), or a value computed before the write (`next()`), which is
// stored in a `const` so that it is computed once.
function Counter({step, next}) {
  let count = 0;
  let factor = 2;
  return (
    <>
      <button onClick={() => { count += step; }}>step</button>
      <button onClick={() => { count = count * factor; }}>scale</button>
      <button onClick={() => { const n = next(); count = count + n; }}>next</button>
      <button onClick={() => { count -= next() * 2; }}>inline</button>
      <button onClick={() => { factor++; }}>{count}</button>
    </>
  );
}
