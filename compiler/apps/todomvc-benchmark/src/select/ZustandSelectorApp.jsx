/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {CARD_IDS} from './data.js';
import {useSelectStore} from './zustandStore.js';

// Compares in the selector, so the selected value only changes for the cards
// whose comparison changes.
function Card({id}) {
  const card = useSelectStore(state => state.cards[id]);
  const isSelected = useSelectStore(state => state.selectedId === id);
  const select = useSelectStore(state => state.select);
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

export default function ZustandSelectorApp() {
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
