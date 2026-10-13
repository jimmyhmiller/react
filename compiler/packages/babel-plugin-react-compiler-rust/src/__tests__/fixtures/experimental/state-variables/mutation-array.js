// @enableStateVariables
// A mutation of the value of a `let` by a function that runs after render
// updates the state: the mutation is applied to a copy, by an updater. What the
// mutation uses is computed where it was written, and captured.
function Todos() {
  let todos = [];
  let text = '';
  return (
    <>
      <input value={text} onChange={e => (text = e.target.value)} />
      <button
        onClick={() => {
          todos.push({id: todos.length, title: text});
          text = '';
        }}>
        Add
      </button>
      <button onClick={() => { todos.pop(); }}>Undo</button>
      {todos.map(todo => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: Todos,
  params: [{}],
};
