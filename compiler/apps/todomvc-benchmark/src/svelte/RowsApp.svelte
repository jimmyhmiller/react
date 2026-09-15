<!--
  Copyright (c) Meta Platforms, Inc. and affiliates.

  This source code is licensed under the MIT license found in the
  LICENSE file in the root directory of this source tree.
-->

<!--
  js-framework-benchmark (keyed) in idiomatic Svelte 5, following the official
  Svelte 5 implementation: a raw array of rows whose labels are $state, and
  the same DOM as ../RowsApp.jsx.
-->

<script>
  import {buildRows} from '../shared/rowData.js';

  class Row {
    label = $state('');
    constructor(id, label) {
      this.id = id;
      this.label = label;
    }
  }
  const createRow = (id, label) => new Row(id, label);

  let data = $state.raw([]);
  let selected = $state(0);

  function run() {
    data = buildRows(1000, createRow);
    selected = 0;
  }
  function runLots() {
    data = buildRows(10000, createRow);
    selected = 0;
  }
  function add() {
    data = data.concat(buildRows(1000, createRow));
  }
  function update() {
    for (let i = 0; i < data.length; i += 10) {
      data[i].label += ' !!!';
    }
  }
  function clear() {
    data = [];
    selected = 0;
  }
  function swapRows() {
    if (data.length > 998) {
      const rows = data.slice();
      const row = rows[1];
      rows[1] = rows[998];
      rows[998] = row;
      data = rows;
    }
  }
  function remove(id) {
    const index = data.findIndex(row => row.id === id);
    data = [...data.slice(0, index), ...data.slice(index + 1)];
  }
</script>

{#snippet button(id, title, cb)}<div class="col-sm-6 smallpad"
    ><button type="button" class="btn btn-primary btn-block" {id} onclick={cb}>{title}</button></div
  >{/snippet}

<div class="container"
  ><div class="jumbotron"
    ><div class="row"
      ><div class="col-md-6"><h1>React Hooks keyed</h1></div
      ><div class="col-md-6"
        ><div class="row"
          >{@render button('run', 'Create 1,000 rows', run)}{@render button(
            'runlots',
            'Create 10,000 rows',
            runLots,
          )}{@render button('add', 'Append 1,000 rows', add)}{@render button(
            'update',
            'Update every 10th row',
            update,
          )}{@render button('clear', 'Clear', clear)}{@render button(
            'swaprows',
            'Swap Rows',
            swapRows,
          )}</div
        ></div
      ></div
    ></div
  ><table class="table table-hover table-striped test-data"
    ><tbody
      >{#each data as row (row.id)}<tr class={selected === row.id ? 'danger' : ''}
          ><td class="col-md-1">{row.id}</td
          ><td class="col-md-4"><a onclick={() => (selected = row.id)}>{row.label}</a></td
          ><td class="col-md-1"
            ><a onclick={() => remove(row.id)}
              ><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a
            ></td
          ><td class="col-md-6"></td
        ></tr
      >{/each}</tbody
    ></table
  ><span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span
></div>
