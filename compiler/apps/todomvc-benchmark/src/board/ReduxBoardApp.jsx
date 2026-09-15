/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// The project board with Redux Toolkit and react-redux: normalized state, card
// ids passed to cards, and `useSelector` for each value a component reads.

import {Provider, useDispatch, useSelector} from 'react-redux';
import {cardMatches} from './data.js';
import {
  closeDetails,
  moveCard,
  renameCard,
  selectCard,
  setFilter,
  store,
  tickNotifications,
  tickPresence,
  toggleOnlyMine,
  toggleStar,
  toggleTheme,
} from './reduxStore.js';

function PresenceBar() {
  const users = useSelector(state => state.session.users);
  const presence = useSelector(state => state.session.presence);
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
  const notifications = useSelector(state => state.session.notifications);
  return (
    <span className="bell">
      Notifications <span className="count">{notifications}</span>
    </span>
  );
}

function ThemeToggle() {
  const theme = useSelector(state => state.ui.theme);
  const dispatch = useDispatch();
  return (
    <button className="theme-toggle" onClick={() => dispatch(toggleTheme())}>
      {theme === 'dark' ? 'Light' : 'Dark'} mode
    </button>
  );
}

function CurrentUser() {
  const users = useSelector(state => state.session.users);
  const currentUserId = useSelector(state => state.session.currentUserId);
  const currentUser = users.find(user => user.id === currentUserId);
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
  const filter = useSelector(state => state.ui.filter);
  const dispatch = useDispatch();
  return (
    <input
      className="search"
      placeholder="Filter cards"
      value={filter}
      onChange={event => dispatch(setFilter(event.target.value))}
    />
  );
}

function OnlyMineToggle() {
  const onlyMine = useSelector(state => state.ui.onlyMine);
  const dispatch = useDispatch();
  return (
    <button
      className={onlyMine ? 'only-mine active' : 'only-mine'}
      onClick={() => dispatch(toggleOnlyMine())}>
      Only mine
    </button>
  );
}

function Simulator() {
  const dispatch = useDispatch();
  return (
    <div className="simulate">
      <button
        id="tick-notifications"
        onClick={() => dispatch(tickNotifications())}>
        Push notification
      </button>
      <button id="tick-presence" onClick={() => dispatch(tickPresence())}>
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

function Card({cardId}) {
  const card = useSelector(state => state.board.cards[cardId]);
  const isSelected = useSelector(state => state.ui.selectedCardId === cardId);
  const isStarred = useSelector(state => state.ui.starred[cardId] === true);
  const users = useSelector(state => state.session.users);
  const currentUserId = useSelector(state => state.session.currentUserId);
  const theme = useSelector(state => state.ui.theme);
  const dispatch = useDispatch();
  const assignee = users.find(user => user.id === card.assigneeId);
  let className = 'card';
  if (isSelected) {
    className += ' selected';
  }
  if (card.assigneeId === currentUserId) {
    className += ' mine';
  }
  return (
    <li
      className={className}
      style={{borderColor: theme === 'dark' ? '#555' : '#ddd'}}>
      <button
        className="card-title"
        onClick={() => dispatch(selectCard(card.id))}>
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
        onClick={() => dispatch(toggleStar(card.id))}>
        {isStarred ? '★' : '☆'}
      </button>
      <button className="move" onClick={() => dispatch(moveCard(card.id))}>
        →
      </button>
    </li>
  );
}

function Column({column}) {
  const cardIds = useSelector(state => state.board.cardIdsByColumn[column.id]);
  const cards = useSelector(state => state.board.cards);
  const filter = useSelector(state => state.ui.filter);
  const onlyMine = useSelector(state => state.ui.onlyMine);
  const currentUserId = useSelector(state => state.session.currentUserId);
  const visibleIds = cardIds.filter(id =>
    cardMatches(cards[id], filter, onlyMine, currentUserId),
  );
  return (
    <section className="column">
      <h2>
        {column.title} <span className="count">{visibleIds.length}</span>
      </h2>
      <ul className="cards">
        {visibleIds.map(id => (
          <Card key={id} cardId={id} />
        ))}
      </ul>
    </section>
  );
}

function Board() {
  const columns = useSelector(state => state.board.columns);
  return (
    <main className="board">
      {columns.map(column => (
        <Column key={column.id} column={column} />
      ))}
    </main>
  );
}

function DetailsPanel() {
  const selectedCardId = useSelector(state => state.ui.selectedCardId);
  const card = useSelector(state =>
    selectedCardId === null ? null : state.board.cards[selectedCardId],
  );
  const users = useSelector(state => state.session.users);
  const dispatch = useDispatch();
  if (card === null) {
    return null;
  }
  const assignee = users.find(user => user.id === card.assigneeId);
  return (
    <aside className="details">
      <input
        className="title-input"
        value={card.title}
        onChange={event =>
          dispatch(renameCard({id: card.id, title: event.target.value}))
        }
      />
      <p className="details-assignee">{assignee.name}</p>
      <button className="close" onClick={() => dispatch(closeDetails())}>
        Close
      </button>
    </aside>
  );
}

function Layout() {
  const theme = useSelector(state => state.ui.theme);
  return (
    <div className={'board-app theme-' + theme}>
      <Header />
      <Toolbar />
      <Board />
      <DetailsPanel />
    </div>
  );
}

export default function BoardApp() {
  return (
    <Provider store={store}>
      <Layout />
    </Provider>
  );
}
