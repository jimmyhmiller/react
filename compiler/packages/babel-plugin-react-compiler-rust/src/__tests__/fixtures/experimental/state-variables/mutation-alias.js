// @enableStateVariables
// A `const` that holds a value of the state is the path it was read from.
function Todos() {
  let todos = [{id: 0, title: 'one', done: false}];
  return (
    <button
      onClick={() => {
        const first = todos[0];
        first.done = true;
        first.title += '!';
      }}>
      {todos[0].title}
    </button>
  );
}
