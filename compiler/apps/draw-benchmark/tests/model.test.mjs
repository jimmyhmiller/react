import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reduce } from '../src/model.js';
import { makeShapes, trace } from '../src/trace.js';
import { createStore } from '../src/store.js';

test('deterministic trace has 5000 meaningful actions and both primitives', () => {
  assert.equal(trace.length, 5000);
  assert.deepEqual(makeShapes(), makeShapes());
  let state = initialState();
  for (const action of trace) {
    const next = reduce(state, action);
    assert.equal(next.$clock.revision, state.$clock.revision + 1);
    if (action.type === 'edit') assert.notEqual(state[state.$document.selected][action.field], action.value);
    state = next;
  }
  assert.equal(state.$document.ids.length, 1000);
  assert.equal(state['shape-999'].type, 'text');
  assert.equal(state['shape-999'].text, 'React');
});

test('store preserves snapshots and only notifies changed entity subscribers', () => {
  const store = createStore();
  store.dispatch(trace[0]);
  const first = store.get('shape-0');
  assert.strictEqual(store.get('shape-0'), first);
  let notifications = 0;
  const unsubscribe = store.subscribe('shape-0', () => notifications++);
  store.dispatch(trace[1]);
  assert.equal(notifications, 1);
  assert.notStrictEqual(store.get('shape-0'), first);
  const updated = store.get('shape-0');
  store.dispatch({ type: 'add', kind: 'box' });
  assert.equal(notifications, 1);
  assert.strictEqual(store.get('shape-0'), updated);
  unsubscribe();
  store.dispatch({ type: 'reset' });
  assert.equal(notifications, 1);
  assert.deepEqual(store.snapshot(), initialState());
});

test('Context reducer and external store produce identical state after every action', () => {
  const store = createStore();
  let state = initialState();
  for (const action of trace) {
    state = reduce(state, action); store.dispatch(action);
    assert.deepEqual(store.get('$clock'), state.$clock);
    assert.deepEqual(store.get('$document'), state.$document);
    assert.deepEqual(store.get(state.$document.selected), state[state.$document.selected]);
  }
  assert.deepEqual(store.snapshot(), state);
});
