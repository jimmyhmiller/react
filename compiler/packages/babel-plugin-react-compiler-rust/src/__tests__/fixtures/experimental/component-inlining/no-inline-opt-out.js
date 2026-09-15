// @enableComponentInlining
function Label({text}) {
  'use no memo';
  return <span>{text}</span>;
}

function App() {
  return (
    <div>
      <Label text="a" />
    </div>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{}],
};
