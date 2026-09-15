/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// The project board with a Zustand store, reading one field per selector as
// the Zustand documentation recommends.

import {cardMatches} from './data.js';
import {useBoardStore} from './zustandStore.js';

function PresenceBar() {
  const users = useBoardStore(state => state.users);
  const presence = useBoardStore(state => state.presence);
  return (
    <ul className="presence">
      {presence.map(id => {
        const user = users.find(u => u.id === id);
        return (
          <li key={id} className="avatar" title={user.name}>
            {user.initials}
          </li>
        );
      })}
    </ul>
  );
}

function NotificationBell() {
  const notifications = useBoardStore(state => state.notifications);
  return (
    <span className="bell">
      Notifications <span className="count">{notifications}</span>
    </span>
  );
}

function ThemeToggle() {
  const theme = useBoardStore(state => state.theme);
  const toggleTheme = useBoardStore(state => state.toggleTheme);
  return (
    <button className="theme-toggle" onClick={toggleTheme}>
      {theme === 'dark' ? 'Light' : 'Dark'} mode
    </button>
  );
}

function CurrentUser() {
  const currentUser = useBoardStore(state => state.currentUser);
  return <span className="current-user">{currentUser.name}</span>;
}

function Header() {
  return (
    <header className="app-header">
      <h1>Board</h1>
      <PresenceBar />
      <NotificationBell />
      <ThemeToggle />
      <CurrentUser />
    </header>
  );
}

function SearchBox() {
  const filter = useBoardStore(state => state.filter);
  const setFilter = useBoardStore(state => state.setFilter);
  return (
    <input
      className="search"
      placeholder="Filter cards"
      value={filter}
      onChange={event => setFilter(event.target.value)}
    />
  );
}

function OnlyMineToggle() {
  const onlyMine = useBoardStore(state => state.onlyMine);
  const toggleOnlyMine = useBoardStore(state => state.toggleOnlyMine);
  return (
    <button
      className={onlyMine ? 'only-mine active' : 'only-mine'}
      onClick={toggleOnlyMine}>
      Only mine
    </button>
  );
}

function Simulator() {
  const tickNotifications = useBoardStore(state => state.tickNotifications);
  const tickPresence = useBoardStore(state => state.tickPresence);
  return (
    <div className="simulate">
      <button id="tick-notifications" onClick={tickNotifications}>
        Push notification
      </button>
      <button id="tick-presence" onClick={tickPresence}>
        Push presence
      </button>
    </div>
  );
}

function Toolbar() {
  return (
    <div className="toolbar">
      <SearchBox />
      <OnlyMineToggle />
      <Simulator />
    </div>
  );
}

function Label({label}) {
  return <span className={'label label-' + label}>{label}</span>;
}

function Card({card}) {
  const selectedCardId = useBoardStore(state => state.selectedCardId);
  const starred = useBoardStore(state => state.starred);
  const users = useBoardStore(state => state.users);
  const currentUser = useBoardStore(state => state.currentUser);
  const theme = useBoardStore(state => state.theme);
  const selectCard = useBoardStore(state => state.selectCard);
  const toggleStar = useBoardStore(state => state.toggleStar);
  const moveCard = useBoardStore(state => state.moveCard);
  const assignee = users.find(user => user.id === card.assigneeId);
  const isSelected = card.id === selectedCardId;
  const isStarred = starred[card.id] === true;
  let className = 'card';
  if (isSelected) {
    className += ' selected';
  }
  if (card.assigneeId === currentUser.id) {
    className += ' mine';
  }
  return (
    <li
      className={className}
      style={{borderColor: theme === 'dark' ? '#555' : '#ddd'}}>
      <button className="card-title" onClick={() => selectCard(card.id)}>
        {card.title}
      </button>
      <div className="card-meta">
        <span className="assignee" title={assignee.name}>
          {assignee.initials}
        </span>
        <span className="points">{card.points}</span>
        {card.labels.map(label => (
          <Label key={label} label={label} />
        ))}
      </div>
      <button
        className={isStarred ? 'star starred' : 'star'}
        onClick={() => toggleStar(card.id)}>
        {isStarred ? '★' : '☆'}
      </button>
      <button className="move" onClick={() => moveCard(card.id)}>
        →
      </button>
    </li>
  );
}

function Column({column}) {
  const cards = useBoardStore(state => state.cards);
  const filter = useBoardStore(state => state.filter);
  const onlyMine = useBoardStore(state => state.onlyMine);
  const currentUser = useBoardStore(state => state.currentUser);
  const columnCards = cards.filter(
    card =>
      card.columnId === column.id &&
      cardMatches(card, filter, onlyMine, currentUser.id),
  );
  return (
    <section className="column">
      <h2>
        {column.title} <span className="count">{columnCards.length}</span>
      </h2>
      <ul className="cards">
        {columnCards.map(card => (
          <Card key={card.id} card={card} />
        ))}
      </ul>
    </section>
  );
}

function Board() {
  const columns = useBoardStore(state => state.columns);
  return (
    <main className="board">
      {columns.map(column => (
        <Column key={column.id} column={column} />
      ))}
    </main>
  );
}

function DetailsPanel() {
  const cards = useBoardStore(state => state.cards);
  const users = useBoardStore(state => state.users);
  const selectedCardId = useBoardStore(state => state.selectedCardId);
  const renameCard = useBoardStore(state => state.renameCard);
  const closeDetails = useBoardStore(state => state.closeDetails);
  if (selectedCardId === null) {
    return null;
  }
  const card = cards.find(c => c.id === selectedCardId);
  const assignee = users.find(user => user.id === card.assigneeId);
  return (
    <aside className="details">
      <input
        className="title-input"
        value={card.title}
        onChange={event => renameCard(card.id, event.target.value)}
      />
      <p className="details-assignee">{assignee.name}</p>
      <button className="close" onClick={closeDetails}>
        Close
      </button>
    </aside>
  );
}

export default function BoardApp() {
  const theme = useBoardStore(state => state.theme);
  return (
    <div className={'board-app theme-' + theme}>
      <Header />
      <Toolbar />
      <Board />
      <DetailsPanel />
    </div>
  );
}
