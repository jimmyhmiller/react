// @enableStateVariables
// A destructuring assignment writes each variable. `c` has no initial value.
function Swap() {
  let a = 1,
    b = 2,
    c;
  return (
    <button
      onClick={() => {
        [a, b] = [b, a];
        c = a;
      }}>
      {a}
      {b}
      {c}
    </button>
  );
}
