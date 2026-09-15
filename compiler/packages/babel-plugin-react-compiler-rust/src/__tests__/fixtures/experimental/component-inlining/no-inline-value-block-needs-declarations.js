// @enableComponentInlining
// Inside `cond && <Greeting />` the inlined body could not declare `name`
// (value blocks only contain expressions), so the site is not inlined.
function Greeting({name = 'world'}) {
  return <b>{name}</b>;
}

function App({cond}) {
  return <div>{cond > 0 && <Greeting />}</div>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{cond: 1}],
};
