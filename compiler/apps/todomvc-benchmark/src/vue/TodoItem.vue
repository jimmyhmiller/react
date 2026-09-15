<!--
  Copyright (c) Meta Platforms, Inc. and affiliates.

  This source code is licensed under the MIT license found in the
  LICENSE file in the root directory of this source tree.
-->

<script setup>
import EditField from './EditField.vue';

const props = defineProps({todo: Object, editing: Boolean});
const emit = defineEmits(['toggle', 'destroy', 'edit', 'save', 'cancel']);
</script>

<template>
  <li :class="(todo.completed ? 'completed' : '') + (editing ? ' editing' : '')">
    <div class="view">
      <input
        class="toggle"
        type="checkbox"
        :checked="todo.completed"
        @change="emit('toggle', todo.id)" />
      <label @dblclick="emit('edit', todo.id)">{{ todo.title }}</label>
      <button class="destroy" @click="emit('destroy', todo.id)"></button>
    </div>
    <EditField
      v-if="editing"
      :initial-title="todo.title"
      @save="title => emit('save', props.todo.id, title)"
      @cancel="emit('cancel')" />
  </li>
</template>
