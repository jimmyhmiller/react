/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// An idiomatic TodoMVC (https://todomvc.com) written with hooks and small
// presentational components. The same source is compiled by every benchmark
// variant; it is not written to suit any particular compiler feature.

import {useRef, useState} from 'react';

const ENTER_KEY = 'Enter';
const ESCAPE_KEY = 'Escape';

function Header({onAdd}) {
  const [text, setText] = useState('');
  return (
    <header className="header">
      <h1>todos</h1>
      <input
        className="new-todo"
        placeholder="What needs to be done?"
        autoFocus
        value={text}
        onChange={event => setText(event.target.value)}
        onKeyDown={event => {
          if (event.key !== ENTER_KEY) {
            return;
          }
          const title = text.trim();
          if (title.length > 0) {
            onAdd(title);
            setText('');
          }
        }}
      />
    </header>
  );
}

function ToggleAll({allCompleted, onToggleAll}) {
  return (
    <div className="toggle-all-container">
      <input
        id="toggle-all"
        className="toggle-all"
        type="checkbox"
        checked={allCompleted}
        onChange={onToggleAll}
      />
      <label className="toggle-all-label" htmlFor="toggle-all">
        Mark all as complete
      </label>
    </div>
  );
}

function TodoCheckbox({completed, onToggle}) {
  return (
    <input
      className="toggle"
      type="checkbox"
      checked={completed}
      onChange={onToggle}
    />
  );
}

function TodoTitle({title, onEdit}) {
  return <label onDoubleClick={onEdit}>{title}</label>;
}

function DestroyButton({onDestroy}) {
  return <button className="destroy" onClick={onDestroy} />;
}

function EditField({initialTitle, onSave, onCancel}) {
  const [text, setText] = useState(initialTitle);
  return (
    <input
      className="edit"
      autoFocus
      value={text}
      onChange={event => setText(event.target.value)}
      onBlur={() => onSave(text)}
      onKeyDown={event => {
        if (event.key === ENTER_KEY) {
          onSave(text);
        } else if (event.key === ESCAPE_KEY) {
          onCancel();
        }
      }}
    />
  );
}

function TodoItem({todo, editing, onToggle, onDestroy, onEdit, onSave, onCancel}) {
  let className = '';
  if (todo.completed) {
    className = 'completed';
  }
  if (editing) {
    className += ' editing';
  }
  return (
    <li className={className}>
      <div className="view">
        <TodoCheckbox
          completed={todo.completed}
          onToggle={() => onToggle(todo.id)}
        />
        <TodoTitle title={todo.title} onEdit={() => onEdit(todo.id)} />
        <DestroyButton onDestroy={() => onDestroy(todo.id)} />
      </div>
      {editing ? (
        <EditField
          initialTitle={todo.title}
          onSave={title => onSave(todo.id, title)}
          onCancel={onCancel}
        />
      ) : null}
    </li>
  );
}

function TodoList({todos, editingId, onToggle, onDestroy, onEdit, onSave, onCancel}) {
  return (
    <ul className="todo-list">
      {todos.map(todo => (
        <TodoItem
          key={todo.id}
          todo={todo}
          editing={todo.id === editingId}
          onToggle={onToggle}
          onDestroy={onDestroy}
          onEdit={onEdit}
          onSave={onSave}
          onCancel={onCancel}
        />
      ))}
    </ul>
  );
}

function TodoCount({count}) {
  return (
    <span className="todo-count">
      <strong>{count}</strong> {count === 1 ? 'item' : 'items'} left
    </span>
  );
}

function FilterLink({filter, selected, onSelect, children}) {
  return (
    <li>
      <a
        className={selected ? 'selected' : ''}
        href={'#/' + filter}
        onClick={event => {
          event.preventDefault();
          onSelect(filter);
        }}>
        {children}
      </a>
    </li>
  );
}

function ClearCompleted({onClear}) {
  return (
    <button className="clear-completed" onClick={onClear}>
      Clear completed
    </button>
  );
}

function Footer({activeCount, completedCount, filter, onFilter, onClearCompleted}) {
  return (
    <footer className="footer">
      <TodoCount count={activeCount} />
      <ul className="filters">
        <FilterLink filter="all" selected={filter === 'all'} onSelect={onFilter}>
          All
        </FilterLink>
        <FilterLink
          filter="active"
          selected={filter === 'active'}
          onSelect={onFilter}>
          Active
        </FilterLink>
        <FilterLink
          filter="completed"
          selected={filter === 'completed'}
          onSelect={onFilter}>
          Completed
        </FilterLink>
      </ul>
      {completedCount > 0 && <ClearCompleted onClear={onClearCompleted} />}
    </footer>
  );
}

export default function TodoApp() {
  const [todos, setTodos] = useState([]);
  const [filter, setFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const nextId = useRef(0);

  const addTodo = title => {
    const id = nextId.current;
    nextId.current = id + 1;
    setTodos(current => [...current, {id, title, completed: false}]);
  };
  const toggleTodo = id => {
    setTodos(current =>
      current.map(todo =>
        todo.id === id ? {...todo, completed: !todo.completed} : todo,
      ),
    );
  };
  const destroyTodo = id => {
    setTodos(current => current.filter(todo => todo.id !== id));
  };
  const saveTodo = (id, title) => {
    const trimmed = title.trim();
    setTodos(current =>
      trimmed.length === 0
        ? current.filter(todo => todo.id !== id)
        : current.map(todo => (todo.id === id ? {...todo, title: trimmed} : todo)),
    );
    setEditingId(null);
  };
  const cancelEdit = () => setEditingId(null);

  const activeCount = todos.filter(todo => !todo.completed).length;
  const completedCount = todos.length - activeCount;
  const allCompleted = todos.length > 0 && activeCount === 0;
  const visibleTodos =
    filter === 'active'
      ? todos.filter(todo => !todo.completed)
      : filter === 'completed'
        ? todos.filter(todo => todo.completed)
        : todos;

  return (
    <section className="todoapp">
      <Header onAdd={addTodo} />
      {todos.length > 0 && (
        <section className="main">
          <ToggleAll
            allCompleted={allCompleted}
            onToggleAll={() =>
              setTodos(current =>
                current.map(todo => ({...todo, completed: !allCompleted})),
              )
            }
          />
          <TodoList
            todos={visibleTodos}
            editingId={editingId}
            onToggle={toggleTodo}
            onDestroy={destroyTodo}
            onEdit={setEditingId}
            onSave={saveTodo}
            onCancel={cancelEdit}
          />
        </section>
      )}
      {todos.length > 0 && (
        <Footer
          activeCount={activeCount}
          completedCount={completedCount}
          filter={filter}
          onFilter={setFilter}
          onClearCompleted={() =>
            setTodos(current => current.filter(todo => !todo.completed))
          }
        />
      )}
    </section>
  );
}
