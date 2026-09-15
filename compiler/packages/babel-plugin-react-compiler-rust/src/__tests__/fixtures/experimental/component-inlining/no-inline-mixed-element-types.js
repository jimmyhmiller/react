// @enableComponentInlining
// `cond ? <Label/> : <span/>` would reuse the <span> DOM node after inlining
// instead of remounting, so this site must not be inlined.
function Label({text}) {
  return <span>{text}</span>;
}

function App({cond}) {
  return <div>{cond ? <Label text="a" /> : <span>b</span>}</div>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{cond: true}],
  sequentialRenders: [{cond: true}, {cond: false}],
};
