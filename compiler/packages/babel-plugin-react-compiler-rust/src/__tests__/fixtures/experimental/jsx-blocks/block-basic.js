// @enableJsxBlocks
function TodoItem({todo, onToggle, onDestroy}) {
  return (
    <li className={todo.completed ? 'completed' : ''}>
      <div className="view">
        <label onDoubleClick={onToggle}>{todo.title}</label>
        <button className="destroy" onClick={onDestroy} />
      </div>
    </li>
  );
}
