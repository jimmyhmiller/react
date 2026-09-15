<!--
  Copyright (c) Meta Platforms, Inc. and affiliates.

  This source code is licensed under the MIT license found in the
  LICENSE file in the root directory of this source tree.
-->

<!--
  TodoMVC in idiomatic Vue 3: deeply reactive state mutated in place, with the
  same component structure and DOM as ../TodoApp.jsx.
-->

<script setup>
import {computed, onMounted, ref} from 'vue';
import TodoItem from './TodoItem.vue';

const ENTER_KEY = 'Enter';

const todos = ref([]);
const filter = ref('all');
const editingId = ref(null);
const newTitle = ref('');
const newTitleInput = ref(null);
let nextId = 0;

onMounted(() => newTitleInput.value.focus());

const activeCount = computed(
  () => todos.value.filter(todo => !todo.completed).length,
);
const completedCount = computed(() => todos.value.length - activeCount.value);
const allCompleted = computed(
  () => todos.value.length > 0 && activeCount.value === 0,
);
const visibleTodos = computed(() =>
  filter.value === 'active'
    ? todos.value.filter(todo => !todo.completed)
    : filter.value === 'completed'
      ? todos.value.filter(todo => todo.completed)
      : todos.value,
);

function onNewTitleKeyDown(event) {
  if (event.key !== ENTER_KEY) {
    return;
  }
  const title = newTitle.value.trim();
  if (title.length > 0) {
    todos.value.push({id: nextId++, title, completed: false});
    newTitle.value = '';
  }
}

function toggleTodo(id) {
  const todo = todos.value.find(todo => todo.id === id);
  todo.completed = !todo.completed;
}

function destroyTodo(id) {
  todos.value = todos.value.filter(todo => todo.id !== id);
}

function saveTodo(id, title) {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    todos.value = todos.value.filter(todo => todo.id !== id);
  } else {
    const todo = todos.value.find(todo => todo.id === id);
    if (todo !== undefined) {
      todo.title = trimmed;
    }
  }
  editingId.value = null;
}

function toggleAll() {
  const completed = !allCompleted.value;
  for (const todo of todos.value) {
    todo.completed = completed;
  }
}

function selectFilter(event, name) {
  event.preventDefault();
  filter.value = name;
}
</script>

<template>
  <section class="todoapp">
    <header class="header">
      <h1>todos</h1>
      <input
        ref="newTitleInput"
        class="new-todo"
        placeholder="What needs to be done?"
        v-model="newTitle"
        @keydown="onNewTitleKeyDown" />
    </header>
    <section v-if="todos.length > 0" class="main">
      <div class="toggle-all-container">
        <input
          id="toggle-all"
          class="toggle-all"
          type="checkbox"
          :checked="allCompleted"
          @change="toggleAll" />
        <label class="toggle-all-label" for="toggle-all">Mark all as complete</label>
      </div>
      <ul class="todo-list">
        <TodoItem
          v-for="todo in visibleTodos"
          :key="todo.id"
          :todo="todo"
          :editing="todo.id === editingId"
          @toggle="toggleTodo"
          @destroy="destroyTodo"
          @edit="id => (editingId = id)"
          @save="saveTodo"
          @cancel="editingId = null" />
      </ul>
    </section>
    <footer v-if="todos.length > 0" class="footer">
      <span class="todo-count"><strong>{{ activeCount }}</strong> {{ activeCount === 1 ? 'item' : 'items' }} left</span>
      <ul class="filters">
        <li><a :class="filter === 'all' ? 'selected' : ''" href="#/all" @click="selectFilter($event, 'all')">All</a></li>
        <li><a :class="filter === 'active' ? 'selected' : ''" href="#/active" @click="selectFilter($event, 'active')">Active</a></li>
        <li><a :class="filter === 'completed' ? 'selected' : ''" href="#/completed" @click="selectFilter($event, 'completed')">Completed</a></li>
      </ul>
      <button
        v-if="completedCount > 0"
        class="clear-completed"
        @click="todos = todos.filter(todo => !todo.completed)">Clear completed</button>
    </footer>
  </section>
</template>
