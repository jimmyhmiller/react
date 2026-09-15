/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// TodoMVC in idiomatic Solid: a store with fine-grained updates and the same
// component structure and DOM as ../TodoApp.jsx.

import {For, Show, createMemo, createSignal, onMount} from 'solid-js';
import {createStore} from 'solid-js/store';

const ENTER_KEY = 'Enter';
const ESCAPE_KEY = 'Escape';

function Header(props) {
  const [text, setText] = createSignal('');
  let input;
  onMount(() => input.focus());
  return (
    <header class="header">
      <h1>todos</h1>
      <input
        ref={input}
        class="new-todo"
        placeholder="What needs to be done?"
        value={text()}
        onInput={event => setText(event.currentTarget.value)}
        onKeyDown={event => {
          if (event.key !== ENTER_KEY) {
            return;
          }
          const title = text().trim();
          if (title.length > 0) {
            props.onAdd(title);
            setText('');
          }
        }}
      />
    </header>
  );
}

function ToggleAll(props) {
  return (
    <div class="toggle-all-container">
      <input
        id="toggle-all"
        class="toggle-all"
        type="checkbox"
        checked={props.allCompleted}
        onChange={props.onToggleAll}
      />
      <label class="toggle-all-label" for="toggle-all">
        Mark all as complete
      </label>
    </div>
  );
}

function EditField(props) {
  const [text, setText] = createSignal(props.initialTitle);
  let input;
  onMount(() => input.focus());
  return (
    <input
      ref={input}
      class="edit"
      value={text()}
      onInput={event => setText(event.currentTarget.value)}
      onBlur={() => props.onSave(text())}
      onKeyDown={event => {
        if (event.key === ENTER_KEY) {
          props.onSave(text());
        } else if (event.key === ESCAPE_KEY) {
          props.onCancel();
        }
      }}
    />
  );
}

function TodoItem(props) {
  return (
    <li
      class={
        (props.todo.completed ? 'completed' : '') +
        (props.editing ? ' editing' : '')
      }>
      <div class="view">
        <input
          class="toggle"
          type="checkbox"
          checked={props.todo.completed}
          onChange={() => props.onToggle(props.todo.id)}
        />
        <label onDblClick={() => props.onEdit(props.todo.id)}>
          {props.todo.title}
        </label>
        <button class="destroy" onClick={() => props.onDestroy(props.todo.id)} />
      </div>
      <Show when={props.editing}>
        <EditField
          initialTitle={props.todo.title}
          onSave={title => props.onSave(props.todo.id, title)}
          onCancel={props.onCancel}
        />
      </Show>
    </li>
  );
}

function FilterLink(props) {
  return (
    <li>
      <a
        class={props.selected ? 'selected' : ''}
        href={'#/' + props.filter}
        onClick={event => {
          event.preventDefault();
          props.onSelect(props.filter);
        }}>
        {props.children}
      </a>
    </li>
  );
}

function Footer(props) {
  return (
    <footer class="footer">
      <span class="todo-count">
        <strong>{props.activeCount}</strong>{' '}
        {props.activeCount === 1 ? 'item' : 'items'} left
      </span>
      <ul class="filters">
        <FilterLink
          filter="all"
          selected={props.filter === 'all'}
          onSelect={props.onFilter}>
          All
        </FilterLink>
        <FilterLink
          filter="active"
          selected={props.filter === 'active'}
          onSelect={props.onFilter}>
          Active
        </FilterLink>
        <FilterLink
          filter="completed"
          selected={props.filter === 'completed'}
          onSelect={props.onFilter}>
          Completed
        </FilterLink>
      </ul>
      <Show when={props.completedCount > 0}>
        <button class="clear-completed" onClick={props.onClearCompleted}>
          Clear completed
        </button>
      </Show>
    </footer>
  );
}

export default function TodoApp() {
  const [state, setState] = createStore({
    todos: [],
    filter: 'all',
    editingId: null,
  });
  let nextId = 0;

  const addTodo = title => {
    const id = nextId++;
    setState('todos', state.todos.length, {id, title, completed: false});
  };
  const toggleTodo = id => {
    setState('todos', todo => todo.id === id, 'completed', completed => !completed);
  };
  const destroyTodo = id => {
    setState('todos', todos => todos.filter(todo => todo.id !== id));
  };
  const saveTodo = (id, title) => {
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      setState('todos', todos => todos.filter(todo => todo.id !== id));
    } else {
      setState('todos', todo => todo.id === id, 'title', trimmed);
    }
    setState('editingId', null);
  };

  const activeCount = createMemo(
    () => state.todos.filter(todo => !todo.completed).length,
  );
  const completedCount = () => state.todos.length - activeCount();
  const allCompleted = () => state.todos.length > 0 && activeCount() === 0;
  const visibleTodos = createMemo(() =>
    state.filter === 'active'
      ? state.todos.filter(todo => !todo.completed)
      : state.filter === 'completed'
        ? state.todos.filter(todo => todo.completed)
        : state.todos,
  );

  return (
    <section class="todoapp">
      <Header onAdd={addTodo} />
      <Show when={state.todos.length > 0}>
        <section class="main">
          <ToggleAll
            allCompleted={allCompleted()}
            onToggleAll={() => {
              const completed = !allCompleted();
              setState('todos', {}, 'completed', completed);
            }}
          />
          <ul class="todo-list">
            <For each={visibleTodos()}>
              {todo => (
                <TodoItem
                  todo={todo}
                  editing={todo.id === state.editingId}
                  onToggle={toggleTodo}
                  onDestroy={destroyTodo}
                  onEdit={id => setState('editingId', id)}
                  onSave={saveTodo}
                  onCancel={() => setState('editingId', null)}
                />
              )}
            </For>
          </ul>
        </section>
      </Show>
      <Show when={state.todos.length > 0}>
        <Footer
          activeCount={activeCount()}
          completedCount={completedCount()}
          filter={state.filter}
          onFilter={filter => setState('filter', filter)}
          onClearCompleted={() =>
            setState('todos', todos => todos.filter(todo => !todo.completed))
          }
        />
      </Show>
    </section>
  );
}
