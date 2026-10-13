// @enableContextSelectors @enableSelectorReads @compilationMode:"infer"
// The store hook is registered with its state getter, and each call passes
// the top-level keys of the state that its inline selector reads, whether or
// not the returned value is selected.
import {create} from 'zustand';

export const useBoardStore = create(set => ({
  rows: [],
  labels: {},
  tick: 0,
  bump: () => set(state => ({tick: state.tick + 1})),
}));

export function Cell({id}) {
  const row = useBoardStore(state => state.rows[id]);
  return <span>{row.label}</span>;
}

export function Tick() {
  const tick = useBoardStore(state => state.tick);
  return <output>{tick}</output>;
}

export function Label({id}) {
  const label = useBoardStore(({rows, labels}) => labels[rows[id].labelId]);
  return <b>{label}</b>;
}

export function Named({id}) {
  const select = state => {
    const s = state;
    return s.rows[id];
  };
  const row = useBoardStore(select);
  return <i>{row.label}</i>;
}
