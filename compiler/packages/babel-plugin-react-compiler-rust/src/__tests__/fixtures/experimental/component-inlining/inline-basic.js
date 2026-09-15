// @enableComponentInlining
function Label({text}) {
  return <span className="label">{text}</span>;
}

function Row(props) {
  return (
    <li>
      <Label text={props.name} />
    </li>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: Row,
  params: [{name: 'a'}],
  sequentialRenders: [{name: 'a'}, {name: 'a'}, {name: 'b'}],
};
