// @enableStateVariables
// Several state variables, written by handlers declared in the component and
// in a rendered list.
function Todos({initial}) {
  let text = '';
  let todos = initial;
  const add = () => {
    todos = [...todos, {id: todos.length, title: text}];
    text = '';
  };
  return (
    <>
      <input value={text} onChange={e => (text = e.target.value)} />
      <button onClick={add}>Add</button>
      <ul>
        {todos.map(todo => (
          <li
            key={todo.id}
            onClick={() => {
              todos = todos.filter(other => other !== todo);
            }}>
            {todo.title}
          </li>
        ))}
      </ul>
    </>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: Todos,
  params: [{initial: [{id: 0, title: 'one'}]}],
};
