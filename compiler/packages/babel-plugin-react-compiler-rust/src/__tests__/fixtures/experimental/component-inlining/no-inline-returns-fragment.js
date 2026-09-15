// @enableComponentInlining
function Pair({a, b}) {
  return (
    <>
      <i>{a}</i>
      <i>{b}</i>
    </>
  );
}

function App() {
  return (
    <div>
      <Pair a="1" b="2" />
      <hr />
    </div>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{}],
};
