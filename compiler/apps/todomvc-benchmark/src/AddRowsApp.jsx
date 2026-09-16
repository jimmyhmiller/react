/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {useState} from 'react';

function Row({row}) {
  return (
    <li>
      <span>{row.id}</span>
      <strong>{row.label}</strong>
    </li>
  );
}

export default function AddRowsApp() {
  const [rows, setRows] = useState([]);

  return (
    <main className="add-rows-app">
      <header>
        <div>
          <p>Minimal React list</p>
          <h1>Add rows</h1>
        </div>
        <output>{rows.length.toLocaleString()} rows</output>
      </header>
      <button
        id="add-row"
        type="button"
        onClick={() =>
          setRows(current => {
            const id = current.length + 1;
            return [...current, {id, label: `Row ${id}`}];
          })
        }>
        Add one row
      </button>
      <ol id="row-list">
        {rows.map(row => (
          <Row key={row.id} row={row} />
        ))}
      </ol>
    </main>
  );
}
