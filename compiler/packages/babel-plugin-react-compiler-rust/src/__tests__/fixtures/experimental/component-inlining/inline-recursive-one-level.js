// @enableComponentInlining
// Tree renders itself. It is inlined into App once; the recursive site inside
// the inlined body is left alone (rule C7).
function Tree({depth}) {
  return <div>{depth > 0 && <Tree depth={depth - 1} />}</div>;
}

function App() {
  return (
    <main>
      <Tree depth={2} />
    </main>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{}],
};
