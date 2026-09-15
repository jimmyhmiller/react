<!--
  Copyright (c) Meta Platforms, Inc. and affiliates.

  This source code is licensed under the MIT license found in the
  LICENSE file in the root directory of this source tree.
-->

<script setup>
import {onMounted, ref} from 'vue';

const ENTER_KEY = 'Enter';
const ESCAPE_KEY = 'Escape';

const props = defineProps({initialTitle: String});
const emit = defineEmits(['save', 'cancel']);
// The field edits a copy of the title taken when editing starts.
const text = ref(props.initialTitle);
const input = ref(null);

onMounted(() => input.value.focus());

function onKeyDown(event) {
  if (event.key === ENTER_KEY) {
    emit('save', text.value);
  } else if (event.key === ESCAPE_KEY) {
    emit('cancel');
  }
}
</script>

<template>
  <input
    ref="input"
    class="edit"
    v-model="text"
    @blur="emit('save', text)"
    @keydown="onKeyDown" />
</template>
