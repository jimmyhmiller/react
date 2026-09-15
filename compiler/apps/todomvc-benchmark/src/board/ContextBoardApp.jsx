/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// The project board with React context: a board context (cards and UI
// state), a session context (current user, notifications, presence) and a
// theme context, each read through a custom hook, as is common in apps.

import {createContext, useContext, useReducer, useState} from 'react';
import {
  cardMatches,
  createBoardData,
  nextColumnId,
  presenceAt,
} from './data.js';

const BoardContext = createContext(null);
const SessionContext = createContext(null);
const ThemeContext = createContext(null);

function useBoard() {
  const board = useContext(BoardContext);
  if (board === null) {
    throw new Error('useBoard must be used inside BoardApp');
  }
  return board;
}

function useSession() {
  const session = useContext(SessionContext);
  if (session === null) {
    throw new Error('useSession must be used inside BoardApp');
  }
  return session;
}

function useTheme() {
  const theme = useContext(ThemeContext);
  if (theme === null) {
    throw new Error('useTheme must be used inside BoardApp');
  }
  return theme;
}

function boardReducer(state, action) {
  switch (action.type) {
    case 'select':
      return {...state, selectedCardId: action.id};
    case 'close':
      return {...state, selectedCardId: null};
    case 'filter':
      return {...state, filter: action.filter};
    case 'only-mine':
      return {...state, onlyMine: !state.onlyMine};
    case 'star': {
      const starred = {...state.starred};
      if (starred[action.id]) {
        delete starred[action.id];
      } else {
        starred[action.id] = true;
      }
      return {...state, starred};
    }
    case 'move': {
      const card = state.cards.find(c => c.id === action.id);
      const moved = {...card, columnId: nextColumnId(state.columns, card.columnId)};
      return {
        ...state,
        cards: state.cards.filter(c => c.id !== action.id).concat(moved),
      };
    }
    case 'rename':
      return {
        ...state,
        cards: state.cards.map(c =>
          c.id === action.id ? {...c, title: action.title} : c,
        ),
      };
    default:
      return state;
  }
}

function createInitialState() {
  const {columns, cards} = createBoardData();
  return {
    columns,
    cards,
    selectedCardId: null,
    filter: '',
    onlyMine: false,
    starred: {},
  };
}

function PresenceBar() {
  const {users, presence} = useSession();
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
  const {notifications} = useSession();
  return (
    <span className="bell">
      Notifications <span className="count">{notifications}</span>
    </span>
  );
}

function ThemeToggle() {
  const {theme, toggleTheme} = useTheme();
  return (
    <button className="theme-toggle" onClick={toggleTheme}>
      {theme === 'dark' ? 'Light' : 'Dark'} mode
    </button>
  );
}

function CurrentUser() {
  const {currentUser} = useSession();
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
  const {filter, dispatch} = useBoard();
  return (
    <input
      className="search"
      placeholder="Filter cards"
      value={filter}
      onChange={event => dispatch({type: 'filter', filter: event.target.value})}
    />
  );
}

function OnlyMineToggle() {
  const {onlyMine, dispatch} = useBoard();
  return (
    <button
      className={onlyMine ? 'only-mine active' : 'only-mine'}
      onClick={() => dispatch({type: 'only-mine'})}>
      Only mine
    </button>
  );
}

function Simulator() {
  const {tickNotifications, tickPresence} = useSession();
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
  const {selectedCardId, starred, dispatch} = useBoard();
  const {users, currentUser} = useSession();
  const {theme} = useTheme();
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
      <button
        className="card-title"
        onClick={() => dispatch({type: 'select', id: card.id})}>
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
        onClick={() => dispatch({type: 'star', id: card.id})}>
        {isStarred ? '★' : '☆'}
      </button>
      <button
        className="move"
        onClick={() => dispatch({type: 'move', id: card.id})}>
        →
      </button>
    </li>
  );
}

function Column({column}) {
  const {cards, filter, onlyMine} = useBoard();
  const {currentUser} = useSession();
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
  const {columns} = useBoard();
  return (
    <main className="board">
      {columns.map(column => (
        <Column key={column.id} column={column} />
      ))}
    </main>
  );
}

function DetailsPanel() {
  const {cards, selectedCardId, dispatch} = useBoard();
  const {users} = useSession();
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
        onChange={event =>
          dispatch({type: 'rename', id: card.id, title: event.target.value})
        }
      />
      <p className="details-assignee">{assignee.name}</p>
      <button className="close" onClick={() => dispatch({type: 'close'})}>
        Close
      </button>
    </aside>
  );
}

export default function BoardApp() {
  const [board, dispatch] = useReducer(boardReducer, null, createInitialState);
  const [session, setSession] = useState(() => {
    const {users, currentUserId} = createBoardData();
    return {
      users,
      currentUser: users.find(user => user.id === currentUserId),
      notifications: 0,
      presenceTick: 0,
      presence: presenceAt(users, 0),
    };
  });
  const [theme, setTheme] = useState('light');

  const boardValue = {...board, dispatch};
  const sessionValue = {
    ...session,
    tickNotifications: () =>
      setSession(s => ({...s, notifications: s.notifications + 1})),
    tickPresence: () =>
      setSession(s => ({
        ...s,
        presenceTick: s.presenceTick + 1,
        presence: presenceAt(s.users, s.presenceTick + 1),
      })),
  };
  const themeValue = {
    theme,
    toggleTheme: () => setTheme(t => (t === 'dark' ? 'light' : 'dark')),
  };

  return (
    <SessionContext.Provider value={sessionValue}>
      <ThemeContext.Provider value={themeValue}>
        <BoardContext.Provider value={boardValue}>
          <div className={'board-app theme-' + theme}>
            <Header />
            <Toolbar />
            <Board />
            <DetailsPanel />
          </div>
        </BoardContext.Provider>
      </ThemeContext.Provider>
    </SessionContext.Provider>
  );
}
