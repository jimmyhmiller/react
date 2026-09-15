// @enableComponentInlining
function Label({text}) {
  return <span>{text}</span>;
}
Label.displayName = 'MyLabel';

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
