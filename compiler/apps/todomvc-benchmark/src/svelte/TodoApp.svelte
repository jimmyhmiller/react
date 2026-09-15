<!--
  Copyright (c) Meta Platforms, Inc. and affiliates.

  This source code is licensed under the MIT license found in the
  LICENSE file in the root directory of this source tree.
-->

<!--
  TodoMVC in idiomatic Svelte 5: deeply reactive $state that is mutated in
  place, with the same DOM as ../TodoApp.jsx. Svelte keeps a single space for
  whitespace between sibling nodes, so line breaks between siblings are placed
  inside tags.
-->

<script>
  import TodoItem from './TodoItem.svelte';
  import {focusOnMount} from './focusOnMount.js';

  const ENTER_KEY = 'Enter';

  let todos = $state([]);
  let filter = $state('all');
  let editingId = $state(null);
  let newTitle = $state('');
  let nextId = 0;

  const activeCount = $derived(todos.filter(todo => !todo.completed).length);
  const completedCount = $derived(todos.length - activeCount);
  const allCompleted = $derived(todos.length > 0 && activeCount === 0);
  const visibleTodos = $derived(
    filter === 'active'
      ? todos.filter(todo => !todo.completed)
      : filter === 'completed'
        ? todos.filter(todo => todo.completed)
        : todos,
  );

  function onNewTitleKeyDown(event) {
    if (event.key !== ENTER_KEY) {
      return;
    }
    const title = newTitle.trim();
    if (title.length > 0) {
      todos.push({id: nextId++, title, completed: false});
      newTitle = '';
    }
  }

  function toggleTodo(id) {
    const todo = todos.find(todo => todo.id === id);
    todo.completed = !todo.completed;
  }

  function destroyTodo(id) {
    todos = todos.filter(todo => todo.id !== id);
  }

  function saveTodo(id, title) {
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      todos = todos.filter(todo => todo.id !== id);
    } else {
      const todo = todos.find(todo => todo.id === id);
      if (todo !== undefined) {
        todo.title = trimmed;
      }
    }
    editingId = null;
  }

  function toggleAll() {
    const completed = !allCompleted;
    for (const todo of todos) {
      todo.completed = completed;
    }
  }

  function selectFilter(event, name) {
    event.preventDefault();
    filter = name;
  }
</script>

<section class="todoapp"
  ><header class="header"
    ><h1>todos</h1
    ><input
      class="new-todo"
      placeholder="What needs to be done?"
      use:focusOnMount
      bind:value={newTitle}
      onkeydown={onNewTitleKeyDown}
    /></header
  >{#if todos.length > 0}<section class="main"
      ><div class="toggle-all-container"
        ><input
          id="toggle-all"
          class="toggle-all"
          type="checkbox"
          checked={allCompleted}
          onchange={toggleAll}
        /><label class="toggle-all-label" for="toggle-all">Mark all as complete</label
        ></div
      ><ul class="todo-list"
        >{#each visibleTodos as todo (todo.id)}<TodoItem
            {todo}
            editing={todo.id === editingId}
            onToggle={toggleTodo}
            onDestroy={destroyTodo}
            onEdit={id => (editingId = id)}
            onSave={saveTodo}
            onCancel={() => (editingId = null)}
          />{/each}</ul
      ></section
    ><footer class="footer"
      ><span class="todo-count"><strong>{activeCount}</strong> {activeCount === 1 ? 'item' : 'items'} left</span
      ><ul class="filters"
        ><li><a class={filter === 'all' ? 'selected' : ''} href="#/all" onclick={event => selectFilter(event, 'all')}>All</a></li
        ><li><a class={filter === 'active' ? 'selected' : ''} href="#/active" onclick={event => selectFilter(event, 'active')}>Active</a></li
        ><li><a class={filter === 'completed' ? 'selected' : ''} href="#/completed" onclick={event => selectFilter(event, 'completed')}>Completed</a></li
      ></ul
      >{#if completedCount > 0}<button
          class="clear-completed"
          onclick={() => (todos = todos.filter(todo => !todo.completed))}
          >Clear completed</button
        >{/if}</footer
    >{/if}</section
>
