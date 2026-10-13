// @enableStateVariables
// A component may use what a function prop returns, so the value of the
// assignment is kept: `onSwap` returns what it wrote, `onBump` the sum. (React
// ignores what the event handler of a host element returns, see counter.js.)
function Pair() {
  let a = 1;
  let b = 2;
  return (
    <Foo
      onSwap={() => {
        const t = a;
        a = b;
        b = t;
        return a;
      }}
      onBump={() => (a = a + b * 2)}
      onNext={() => a++}
      a={a}
      b={b}
    />
  );
}
