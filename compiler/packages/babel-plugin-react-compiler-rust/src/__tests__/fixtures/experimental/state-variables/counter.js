// @enableStateVariables
// A `let` that a function reassigns after render is state. The handler only
// writes `count`, so it does not depend on it.
function Counter() {
  let count = 0;
  return <button onClick={() => count++}>{count}</button>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Counter,
  params: [{}],
};
