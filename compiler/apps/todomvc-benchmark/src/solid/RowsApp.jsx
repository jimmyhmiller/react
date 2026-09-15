/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// js-framework-benchmark (keyed) in idiomatic Solid, following the structure
// of the official Solid implementation: a signal per row label and
// createSelector for the selected row. Renders the same DOM as ../RowsApp.jsx.

import {For, batch, createSelector, createSignal} from 'solid-js';
import {buildRows} from '../shared/rowData.js';

function createRow(id, label) {
  const [getLabel, setLabel] = createSignal(label);
  return {id, label: getLabel, setLabel};
}

function Button(props) {
  return (
    <div class="col-sm-6 smallpad">
      <button
        type="button"
        class="btn btn-primary btn-block"
        id={props.id}
        onClick={props.cb}>
        {props.title}
      </button>
    </div>
  );
}

export default function RowsApp() {
  const [data, setData] = createSignal([]);
  const [selected, setSelected] = createSignal(0);
  const isSelected = createSelector(selected);

  const run = () => {
    batch(() => {
      setData(buildRows(1000, createRow));
      setSelected(0);
    });
  };
  const runLots = () => {
    batch(() => {
      setData(buildRows(10000, createRow));
      setSelected(0);
    });
  };
  const add = () => setData(data().concat(buildRows(1000, createRow)));
  const update = () => {
    batch(() => {
      const rows = data();
      for (let i = 0; i < rows.length; i += 10) {
        rows[i].setLabel(label => label + ' !!!');
      }
    });
  };
  const clear = () => {
    batch(() => {
      setData([]);
      setSelected(0);
    });
  };
  const swapRows = () => {
    const rows = data().slice();
    if (rows.length > 998) {
      const row = rows[1];
      rows[1] = rows[998];
      rows[998] = row;
      setData(rows);
    }
  };
  const remove = id => {
    const rows = data();
    const index = rows.findIndex(row => row.id === id);
    setData([...rows.slice(0, index), ...rows.slice(index + 1)]);
  };

  return (
    <div class="container">
      <div class="jumbotron">
        <div class="row">
          <div class="col-md-6">
            <h1>React Hooks keyed</h1>
          </div>
          <div class="col-md-6">
            <div class="row">
              <Button id="run" title="Create 1,000 rows" cb={run} />
              <Button id="runlots" title="Create 10,000 rows" cb={runLots} />
              <Button id="add" title="Append 1,000 rows" cb={add} />
              <Button id="update" title="Update every 10th row" cb={update} />
              <Button id="clear" title="Clear" cb={clear} />
              <Button id="swaprows" title="Swap Rows" cb={swapRows} />
            </div>
          </div>
        </div>
      </div>
      <table class="table table-hover table-striped test-data">
        <tbody>
          <For each={data()}>
            {row => {
              const rowId = row.id;
              return (
                <tr class={isSelected(rowId) ? 'danger' : ''}>
                  <td class="col-md-1">{rowId}</td>
                  <td class="col-md-4">
                    <a onClick={() => setSelected(rowId)}>{row.label()}</a>
                  </td>
                  <td class="col-md-1">
                    <a onClick={() => remove(rowId)}>
                      <span class="glyphicon glyphicon-remove" aria-hidden="true" />
                    </a>
                  </td>
                  <td class="col-md-6" />
                </tr>
              );
            }}
          </For>
        </tbody>
      </table>
      <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
    </div>
  );
}
