// @enableContextSelectors @compilationMode:"infer"
// Context hooks written as arrow functions are registered by the `const` they
// initialize, whether they call `useContext` or `React.useContext`. An arrow
// function that is not the initializer of a top-level `const` has no binding
// to register.
import React, {createContext, useContext} from 'react';

const BoardContext = createContext(null);

export const useBoard = () => useContext(BoardContext);

export const useBoardFromReact = () => React.useContext(BoardContext);

export const hooks = {
  useNested: () => useContext(BoardContext),
};

export function Title({id}) {
  const board = useBoard();
  const other = useBoardFromReact();
  return (
    <h2>
      {board.titles[id]}
      {other.subtitle}
    </h2>
  );
}
