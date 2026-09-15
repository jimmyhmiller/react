// @enableJsxBlocks @enableComponentInlining
function Checkbox({completed, onToggle}) {
  return <span className={completed ? 'on' : 'off'} onClick={onToggle} />;
}

function Title({title}) {
  return <label>{title}</label>;
}

function TodoItem({todo, onToggle}) {
  return (
    <li>
      <div className="view">
        <Checkbox completed={todo.completed} onToggle={onToggle} />
        <Title title={todo.title} />
      </div>
    </li>
  );
}
