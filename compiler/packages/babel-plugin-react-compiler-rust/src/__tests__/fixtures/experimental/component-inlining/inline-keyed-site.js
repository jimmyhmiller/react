// @enableComponentInlining
// The site key moves onto the element returned by the inlined component.
function Label({text}) {
  return <span>{text}</span>;
}

function App({first}) {
  return (
    <div>
      <Label key={first} text={first} />
      <b>static</b>
    </div>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{first: 'a'}],
  sequentialRenders: [{first: 'a'}, {first: 'b'}, {first: 'b'}],
};
