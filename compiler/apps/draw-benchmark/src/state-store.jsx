import { createContext, useContext, useState, useSyncExternalStore } from 'react';
import { createStore } from './store';
const Store = createContext(null);
export function StateProvider({ children }) {
  const [store] = useState(createStore);
  return <Store.Provider value={store}>{children}</Store.Provider>;
}
export function useEntity(id) {
  const store = useContext(Store);
  return useSyncExternalStore(callback => store.subscribe(id, callback), () => store.get(id));
}
export function useDispatch() { return useContext(Store).dispatch; }
export function SnapshotButton() {
  const store = useContext(Store);
  return <button id="snapshot" hidden onClick={() => { window.__drawSnapshot = store.snapshot(); }}>Snapshot</button>;
}
