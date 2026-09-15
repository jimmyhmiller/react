// @enableContextSelectors
// `useBoard` returns the value of its one context read (or throws), so the
// module registers it. The component's call is selected: React applies the
// description when the hook is registered and the call reads exactly that
// context.
import {createContext, useContext} from 'react';

const BoardContext = createContext(null);

export function useBoard() {
  const board = useContext(BoardContext);
  if (board === null) {
    throw new Error('useBoard must be used inside a BoardProvider');
  }
  return board;
}

export function Title({id}) {
  const board = useBoard();
  return <h2>{board.titles[id]}</h2>;
}
