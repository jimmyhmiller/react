// @enableComponentInlining
// `show && <Label />` evaluates to `show` when it is falsy, and `show` could be
// an element, so the position may hold different element types (rule S4).
function Label({text}) {
  return <span>{text}</span>;
}

function App({show}) {
  return <div>{show && <Label text="a" />}</div>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{show: true}],
  sequentialRenders: [{show: true}, {show: <span>b</span>}],
};
