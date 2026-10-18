import { createContext, useContext, useState } from 'react';
import { initialState, reduce } from './model';
const Database = createContext(null);
const Update = createContext(null);
export function StateProvider({ children }) {
  const [database, setDatabase] = useState(initialState);
  return <Database.Provider value={database}><Update.Provider value={setDatabase}>{children}</Update.Provider></Database.Provider>;
}
export function useEntity(id) { return useContext(Database)[id]; }
export function useDispatch() {
  const setDatabase = useContext(Update);
  return action => setDatabase(previous => reduce(previous, action));
}
export function SnapshotButton() {
  const database = useContext(Database);
  return <button id="snapshot" hidden onClick={() => { window.__drawSnapshot = database; }}>Snapshot</button>;
}
