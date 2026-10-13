/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {useAtomValue, useSetAtom} from 'jotai';
import {CARD_IDS} from './data.js';
import {
  cardAtom,
  isSelectedAtom,
  notificationsAtom,
  renameNextAtom,
  selectedIdAtom,
} from './jotaiAtoms.js';

function Card({id}) {
  const card = useAtomValue(cardAtom(id));
  const isSelected = useAtomValue(isSelectedAtom(id));
  const select = useSetAtom(selectedIdAtom);
  return (
    <li className={isSelected ? 'card selected' : 'card'}>
      <button className="card-title" onClick={() => select(id)}>
        {card.title}
      </button>
    </li>
  );
}

function Header() {
  const notifications = useAtomValue(notificationsAtom);
  const setNotifications = useSetAtom(notificationsAtom);
  const renameNext = useSetAtom(renameNextAtom);
  return (
    <header>
      <button id="notify" onClick={() => setNotifications(n => n + 1)}>
        Notify
      </button>
      <output id="notifications">{notifications}</output>
      <button id="rename" onClick={renameNext}>
        Rename
      </button>
    </header>
  );
}

export default function JotaiApp() {
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
