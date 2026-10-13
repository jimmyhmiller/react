// @enableStateVariables
// `user?.tags.push(tag)` does nothing unless `user` has a value. The updater
// tests what the chain tests, in the state that it is given, and leaves that
// state as it is when the test fails. The handler does not read `user`.
function Profile({tag}) {
  let user = {name: 'Ada', tags: [], address: null};
  let todos = null;
  return (
    <>
      <button onClick={() => { user?.tags.push(tag); }}>tag</button>
      <button onClick={() => { user.address?.lines.push(tag); }}>line</button>
      <button
        onClick={() => {
          todos?.push(tag);
          console.log(todos?.length);
        }}>
        todo
      </button>
      {user.name} {todos?.length}
    </>
  );
}
