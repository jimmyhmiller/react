/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {CARD_IDS} from './data.js';
import {useSelectStore} from './zustandStore.js';

// Reads one field per selector and compares in render.
function Card({id}) {
  const card = useSelectStore(state => state.cards[id]);
  const selectedId = useSelectStore(state => state.selectedId);
  const select = useSelectStore(state => state.select);
  const isSelected = id === selectedId;
  return (
    <li className={isSelected ? 'card selected' : 'card'}>
      <button className="card-title" onClick={() => select(id)}>
        {card.title}
      </button>
    </li>
  );
}

function Header() {
  const notifications = useSelectStore(state => state.notifications);
  const notify = useSelectStore(state => state.notify);
  const renameNext = useSelectStore(state => state.renameNext);
  return (
    <header>
      <button id="notify" onClick={notify}>
        Notify
      </button>
      <output id="notifications">{notifications}</output>
      <button id="rename" onClick={renameNext}>
        Rename
      </button>
    </header>
  );
}

export default function ZustandRenderApp() {
  return (
    <main className="select-app">
      <Header />
      <ul>
        {CARD_IDS.map(id => (
          <Card key={id} id={id} />
        ))}
      </ul>
    </main>
  );
}
