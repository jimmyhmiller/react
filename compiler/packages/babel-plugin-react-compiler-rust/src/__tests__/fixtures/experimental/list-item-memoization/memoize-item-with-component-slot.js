// @enableJsxBlocks @enableComponentInlining @enableListItemMemoization
// Like TodoMVC: Item is inlined into the callback and memoized per item. Its
// slot sometimes holds an EditField element (a component with state, which is
// not inlined); React DOM gives a fiber only to the items that need one.
import {useState} from 'react';

function EditField({initialTitle, onSave}) {
  const [text, setText] = useState(initialTitle);
  return (
    <input
      className="edit"
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={() => onSave(text)}
    />
  );
}

function Item({todo, editing, onToggle, onSave}) {
  let className = '';
  if (todo.completed) {
    className = 'completed';
  }
  if (editing) {
    className += ' editing';
  }
  return (
    <li className={className}>
      <label onClick={() => onToggle(todo.id)}>{todo.title}</label>
      {editing ? (
        <EditField
          initialTitle={todo.title}
          onSave={title => onSave(todo.id, title)}
        />
      ) : null}
    </li>
  );
}

function List({todos, editingId, onToggle, onSave}) {
  return (
    <ul className="todo-list">
      {todos.map(todo => (
        <Item
          key={todo.id}
          todo={todo}
          editing={todo.id === editingId}
          onToggle={onToggle}
          onSave={onSave}
        />
      ))}
    </ul>
  );
}
