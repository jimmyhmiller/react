// @enableContextSelectors @enableSelectorReads @compilationMode:"infer"
// Selectors whose reads of the state cannot be described by top-level keys:
// no keys are passed, so React checks these calls on every store change.
import {useBoardStore, selectRows} from './store';

function count(state) {
  return state.rows.length;
}

export function PassesState() {
  const n = useBoardStore(state => count(state));
  return <span>{n}</span>;
}

export function ReturnsState() {
  const state = useBoardStore(state => state);
  return <span>{state.tick}</span>;
}

export function ComputedKey({key}) {
  const value = useBoardStore(state => state[key]);
  return <span>{value}</span>;
}

export function CapturesState() {
  const rows = useBoardStore(state => {
    const read = () => state.rows;
    return read();
  });
  return <span>{rows.length}</span>;
}

export function ImportedSelector() {
  const rows = useBoardStore(selectRows);
  return <span>{rows.length}</span>;
}

export function RestDestructuring() {
  const rest = useBoardStore(({tick, ...others}) => others.rows);
  return <span>{rest.length}</span>;
}
