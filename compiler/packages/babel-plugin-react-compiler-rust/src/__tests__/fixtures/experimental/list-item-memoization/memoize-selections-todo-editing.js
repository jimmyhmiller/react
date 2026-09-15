// @enableJsxBlocks @enableComponentInlining @enableListItemMemoization
// `editingId` is compared with `===` and `hiddenId` with `!==`; both are
// selections. The comparison results are used in several places, including a
// slot that holds a component element.
function EditField({title}) {
  return <input className="edit" defaultValue={title} />;
}

function TodoList({todos, editingId, hiddenId, onToggle}) {
  return (
    <ul className="todo-list">
      {todos.map(todo => {
        const editing = todo.id === editingId;
        const visible = todo.id !== hiddenId;
        let className = todo.completed ? 'completed' : '';
        if (editing) {
          className += ' editing';
        }
        return (
          <li key={todo.id} className={className} hidden={!visible}>
            <label onClick={() => onToggle(todo.id)}>{todo.title}</label>
            {editing ? <EditField title={todo.title} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
