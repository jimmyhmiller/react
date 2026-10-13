// @enableStateVariables
// Each value on the path to the mutated one is copied, and nothing else: the
// other properties and items keep their identity.
function Profile({city}) {
  let user = {name: 'Ada', address: {city: 'London', zip: 'N1'}, tags: new Set()};
  let todos = [{id: 0, done: false}];
  return (
    <>
      <button onClick={() => { user.address.city = city; }}>move</button>
      <button onClick={() => { delete user.name; }}>forget</button>
      <button onClick={() => { user.tags.add(city); }}>tag</button>
      {todos.map((todo, i) => (
        <input
          key={todo.id}
          type="checkbox"
          checked={todo.done}
          onChange={() => { todos[i].done = !todos[i].done; }}
        />
      ))}
      {user.name} {user.address.city}
    </>
  );
}
