// @enableStateVariables
// The compiler can only turn a modification into an update when it can tell
// what is modified. `find` returns some item: modifying it would modify the
// state in place, which React would never render. `unstable_freezeState`
// freezes the state in development, so that this throws instead.
function Todos({id}) {
  let todos = [{id: 0, done: false}];
  return (
    <button
      onClick={() => {
        todos.push({id: 1, done: false});
        todos.find(todo => todo.id === id).done = true;
      }}>
      {todos.length}
    </button>
  );
}
