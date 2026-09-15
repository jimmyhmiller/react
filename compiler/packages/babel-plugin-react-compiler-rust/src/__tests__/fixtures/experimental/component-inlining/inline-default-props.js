// @enableComponentInlining
function Greeting({name = 'world', punctuation}) {
  return (
    <p>
      Hello {name}
      {punctuation}
    </p>
  );
}

function App(props) {
  return (
    <div>
      <Greeting />
      <Greeting name={props.name} punctuation="!" />
    </div>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{name: undefined}],
  sequentialRenders: [{name: undefined}, {name: 'React'}],
};
