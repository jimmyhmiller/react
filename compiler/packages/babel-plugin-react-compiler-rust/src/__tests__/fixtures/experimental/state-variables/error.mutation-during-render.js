// @enableStateVariables
function Todos({first}) {
  let todos = [];
  const add = todo => {
    todos.push(todo);
  };
  add(first);
  return <button onClick={() => add('more')}>{todos.length}</button>;
}
