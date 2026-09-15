<!--
  Copyright (c) Meta Platforms, Inc. and affiliates.

  This source code is licensed under the MIT license found in the
  LICENSE file in the root directory of this source tree.
-->

<!--
  js-framework-benchmark (keyed) in idiomatic Vue 3, following the official
  Vue implementation: a shallow ref of rows with shallow-ref labels, v-memo on
  each row, and the same DOM as ../RowsApp.jsx.
-->

<script setup>
import {ref, shallowRef} from 'vue';
import {buildRows} from '../shared/rowData.js';

const createRow = (id, label) => ({id, label: shallowRef(label)});

const rows = shallowRef([]);
const selected = ref(0);

function run() {
  rows.value = buildRows(1000, createRow);
  selected.value = 0;
}
function runLots() {
  rows.value = buildRows(10000, createRow);
  selected.value = 0;
}
function add() {
  rows.value = rows.value.concat(buildRows(1000, createRow));
}
function update() {
  const current = rows.value;
  for (let i = 0; i < current.length; i += 10) {
    current[i].label.value += ' !!!';
  }
}
function clear() {
  rows.value = [];
  selected.value = 0;
}
function swapRows() {
  const current = rows.value;
  if (current.length > 998) {
    const next = current.slice();
    next[1] = current[998];
    next[998] = current[1];
    rows.value = next;
  }
}
function remove(id) {
  const current = rows.value;
  const index = current.findIndex(row => row.id === id);
  rows.value = [...current.slice(0, index), ...current.slice(index + 1)];
}

const buttons = [
  {id: 'run', title: 'Create 1,000 rows', cb: run},
  {id: 'runlots', title: 'Create 10,000 rows', cb: runLots},
  {id: 'add', title: 'Append 1,000 rows', cb: add},
  {id: 'update', title: 'Update every 10th row', cb: update},
  {id: 'clear', title: 'Clear', cb: clear},
  {id: 'swaprows', title: 'Swap Rows', cb: swapRows},
];
</script>

<template>
  <div class="container">
    <div class="jumbotron">
      <div class="row">
        <div class="col-md-6">
          <h1>React Hooks keyed</h1>
        </div>
        <div class="col-md-6">
          <div class="row">
            <div v-for="button in buttons" :key="button.id" class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" :id="button.id" @click="button.cb">{{ button.title }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <table class="table table-hover table-striped test-data">
      <tbody>
        <tr
          v-for="row of rows"
          :key="row.id"
          :class="selected === row.id ? 'danger' : ''"
          v-memo="[row.label.value, selected === row.id]">
          <td class="col-md-1">{{ row.id }}</td>
          <td class="col-md-4"><a @click="selected = row.id">{{ row.label.value }}</a></td>
          <td class="col-md-1">
            <a @click="remove(row.id)"><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a>
          </td>
          <td class="col-md-6"></td>
        </tr>
      </tbody>
    </table>
    <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
  </div>
</template>
