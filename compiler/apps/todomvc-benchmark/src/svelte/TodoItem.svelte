<!--
  Copyright (c) Meta Platforms, Inc. and affiliates.

  This source code is licensed under the MIT license found in the
  LICENSE file in the root directory of this source tree.
-->

<script>
  import EditField from './EditField.svelte';

  let {todo, editing, onToggle, onDestroy, onEdit, onSave, onCancel} = $props();
</script>

<li class={(todo.completed ? 'completed' : '') + (editing ? ' editing' : '')}
  ><div class="view"
    ><input
      class="toggle"
      type="checkbox"
      checked={todo.completed}
      onchange={() => onToggle(todo.id)}
    /><label ondblclick={() => onEdit(todo.id)}>{todo.title}</label
    ><button class="destroy" onclick={() => onDestroy(todo.id)}></button
  ></div
  >{#if editing}<EditField
      initialTitle={todo.title}
      onSave={title => onSave(todo.id, title)}
      {onCancel}
    />{/if}</li
>
