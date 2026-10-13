// @enableStateVariables
// A read that follows a write reads what was written: the handler gets a local
// copy of the state, which it reads and writes as plain JavaScript would.
function Counter({step}) {
  let count = 0;
  return (
    <button
      onClick={() => {
        count++;
        count += step;
        console.log(count);
      }}>
      {count}
    </button>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: Counter,
  params: [{step: 2}],
};
