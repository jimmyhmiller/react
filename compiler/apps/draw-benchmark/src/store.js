import { initialState, patchFor } from './model.js';
export function createStore() {
  let database = initialState();
  const listeners = new Map();
  return {
    get: id => database[id],
    snapshot: () => structuredClone(database),
    subscribe(id, listener) {
      if (!listeners.has(id)) listeners.set(id, new Set());
      listeners.get(id).add(listener);
      return () => { const group = listeners.get(id); group.delete(listener); if (!group.size) listeners.delete(id); };
    },
    dispatch(action) {
      let changed;
      if (action.type === 'reset') {
        changed = Object.keys(database);
        database = initialState();
      } else {
        const patch = patchFor(database, action);
        changed = Object.keys(patch);
        // Retain all unchanged record identities: useSyncExternalStore requires stable snapshots.
        Object.assign(database, patch);
      }
      const callbacks = new Set(changed.flatMap(id => [...(listeners.get(id) ?? [])]));
      for (const callback of callbacks) callback();
    },
  };
}
