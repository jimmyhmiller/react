/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {create} from 'zustand';

export const LISTENER_COUNT = 5000;

const rows = [];
for (let i = 0; i < LISTENER_COUNT; i++) {
  rows.push({id: i, label: `Cell ${i}`});
}

// The number of listeners subscribed to the store, read by the workload to
// check how many subscriptions React made.
let listenerCount = 0;
if (typeof window !== 'undefined') {
  window.__listenerCount = () => listenerCount;
}

// `tick` is read by one component; `rows` by LISTENER_COUNT components, each
// through its own selector. Bumping `tick` notifies every subscription, but
// no row changes.
export const useListenersStore = create((set, get, api) => {
  // Zustand's hook passes `api.subscribe` to useSyncExternalStore, so this
  // wrapper sees every subscription.
  const subscribe = api.subscribe;
  api.subscribe = listener => {
    listenerCount++;
    const unsubscribe = subscribe(listener);
    return () => {
      listenerCount--;
      unsubscribe();
    };
  };
  return {
    rows,
    tick: 0,
    bump: () => set(state => ({tick: state.tick + 1})),
  };
});
