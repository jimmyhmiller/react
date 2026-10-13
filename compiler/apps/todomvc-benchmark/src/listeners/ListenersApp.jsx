/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {LISTENER_COUNT, useListenersStore} from './listenersStore.js';

const IDS = Array.from({length: LISTENER_COUNT}, (_, i) => i);

function Cell({id}) {
  const row = useListenersStore(state => state.rows[id]);
  return <span className="cell">{row.label}</span>;
}

function Tick() {
  const tick = useListenersStore(state => state.tick);
  const bump = useListenersStore(state => state.bump);
  return (
    <p>
      <button id="bump" type="button" onClick={bump}>
        Bump
      </button>
      <output id="tick">{tick}</output>
    </p>
  );
}

export default function ListenersApp() {
  return (
    <main className="listeners-app">
      <Tick />
      <div className="cells">
        {IDS.map(id => (
          <Cell key={id} id={id} />
        ))}
      </div>
    </main>
  );
}
