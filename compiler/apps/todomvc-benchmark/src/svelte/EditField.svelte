<!--
  Copyright (c) Meta Platforms, Inc. and affiliates.

  This source code is licensed under the MIT license found in the
  LICENSE file in the root directory of this source tree.
-->

<script>
  import {focusOnMount} from './focusOnMount.js';

  const ENTER_KEY = 'Enter';
  const ESCAPE_KEY = 'Escape';

  let {initialTitle, onSave, onCancel} = $props();
  // The field edits a copy of the title taken when editing starts.
  // svelte-ignore state_referenced_locally
  let text = $state(initialTitle);
</script>

<input
  class="edit"
  use:focusOnMount
  bind:value={text}
  onblur={() => onSave(text)}
  onkeydown={event => {
    if (event.key === ENTER_KEY) {
      onSave(text);
    } else if (event.key === ESCAPE_KEY) {
      onCancel();
    }
  }}
/>
