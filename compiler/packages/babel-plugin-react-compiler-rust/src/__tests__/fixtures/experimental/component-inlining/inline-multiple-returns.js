// @enableComponentInlining
function Status({state}) {
  if (state === 'loading') {
    return <em>loading</em>;
  }
  if (state === 'empty') {
    return null;
  }
  return <b>{state}</b>;
}

function Panel(props) {
  return (
    <div>
      <Status state={props.state} />
    </div>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: Panel,
  params: [{state: 'loading'}],
  sequentialRenders: [
    {state: 'loading'},
    {state: 'empty'},
    {state: 'ready'},
    {state: 'loading'},
  ],
};
