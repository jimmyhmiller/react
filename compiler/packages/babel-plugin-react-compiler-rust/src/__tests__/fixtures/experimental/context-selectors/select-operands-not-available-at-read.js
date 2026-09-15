// @enableContextSelectors
// A comparison operand is only moved into the description if it has the same
// value when the context is read: a value computed after the read (here, from
// a local that is mutated) or read from a mutable local selects the compared
// value itself instead.
import {createContext, useContext} from 'react';

const Selection = createContext(null);

function Row({row}) {
  const selection = useContext(Selection);
  const local = {id: row.id};
  local.id = local.id + 1;
  const matchesNext = selection.current === local.id;
  const matchesRow = selection.previous === row.id;
  return (
    <tr>
      <td>{matchesNext ? 'next' : ''}</td>
      <td>{matchesRow ? 'previous' : ''}</td>
    </tr>
  );
}
