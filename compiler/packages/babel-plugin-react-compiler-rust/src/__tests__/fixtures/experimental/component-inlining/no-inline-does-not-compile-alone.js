// @enableComponentInlining @panicThreshold:"none"
// Label mutates its props, which the compiler rejects. Inlined, the props
// object would be a local of App and the mutation would go undetected, so
// Label must not be offered as a candidate (rule C5).
function Label(props) {
  props.seen = true;
  return <span>{props.text}</span>;
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
