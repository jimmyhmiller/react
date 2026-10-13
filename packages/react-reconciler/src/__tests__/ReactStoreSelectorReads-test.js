/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment node
 */

'use strict';

let React;
let ReactNoop;
let Scheduler;
let act;
let assertLog;
let assertConsoleErrorDev;
let waitFor;
let registerStoreHook;
let startSelectedHook;
let selectHookPaths;

// Components are written the way React Compiler emits calls of store hooks
// with enableSelectorReads: `reads` lists the top-level keys of the store's
// state that the selector passed to the hook reads.
describe('selector reads', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    ({
      act,
      assertLog,
      assertConsoleErrorDev,
      waitFor,
    } = require('internal-test-utils'));
    const runtime = require('react/compiler-runtime');
    registerStoreHook = runtime.unstable_registerStoreHook;
    startSelectedHook = runtime.unstable_startSelectedHook;
    selectHookPaths = runtime.unstable_selectHookPaths;
  });

  // A store and a bound hook implemented like Zustand's `create`: `setState`
  // merges the update into a new state object, or replaces the state.
  function createStore(initial) {
    let state = initial;
    const listeners = new Set();
    const api = {
      getState: () => state,
      setState(updater, replace) {
        const next = typeof updater === 'function' ? updater(state) : updater;
        if (!Object.is(next, state)) {
          state = replace ? next : {...state, ...next};
          listeners.forEach(listener => listener());
        }
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      listenerCount: () => listeners.size,
    };
    function useStore(selector) {
      return React.useSyncExternalStore(
        api.subscribe,
        React.useCallback(() => selector(api.getState()), [selector]),
      );
    }
    return {api, useStore};
  }

  function useSelected(useHook, paths, reads, ...args) {
    const started = startSelectedHook(useHook);
    const value = useHook(...args);
    return selectHookPaths(started, value, useHook, paths, reads);
  }

  // The number of times each selector ran since the last reset.
  let calls;
  const selectA = state => {
    calls.a++;
    return state.a;
  };
  const selectB = state => {
    calls.b++;
    return state.b;
  };
  const selectC = state => {
    calls.c++;
    return state.c;
  };

  beforeEach(() => {
    calls = {a: 0, b: 0, c: 0};
  });

  function Value({store, name, select, reads}) {
    const value = useSelected(store.useStore, null, reads, select);
    Scheduler.log(`render ${name} ${value}`);
    return `${name}${value}`;
  }

  // In development, the calls that were not checked are checked again, to
  // warn if their snapshot changed; this is the number of times the selector
  // of a call that was not checked runs.
  const uncheckedCalls = __DEV__ ? 1 : 0;

  // @gate enableContextSelectors && enableSelectorReads
  it('only checks the calls whose selectors read a changed key', async () => {
    const store = createStore({a: 0, b: 0});
    registerStoreHook(store.useStore, store.api.getState);
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <>
          <Value store={store} name="a" select={selectA} reads={['a']} />
          <Value store={store} name="b" select={selectB} reads={['b']} />
        </>,
      ),
    );
    assertLog(['render a 0', 'render b 0']);
    expect(store.api.listenerCount()).toBe(1);

    calls.a = 0;
    await act(() => store.api.setState({b: 1}));
    assertLog(['render b 1']);
    expect(calls.a).toBe(uncheckedCalls);
    expect(root).toMatchRenderedOutput('a0b1');

    calls.b = 0;
    await act(() => store.api.setState({a: 1}));
    assertLog(['render a 1']);
    expect(calls.b).toBe(uncheckedCalls);
    expect(root).toMatchRenderedOutput('a1b1');
  });

  // @gate enableContextSelectors && enableSelectorReads
  it('applies the selection of the snapshot to the calls it checks', async () => {
    const store = createStore({selectedId: null, other: 0});
    registerStoreHook(store.useStore, store.api.getState);
    let selections = 0;
    const selectSelectedId = state => {
      selections++;
      return state.selectedId;
    };
    function Card({id}) {
      const selectedId = useSelected(
        store.useStore,
        [[1, id]],
        ['selectedId'],
        selectSelectedId,
      );
      Scheduler.log(`render ${id} ${selectedId === id}`);
      return selectedId === id ? `[${id}]` : id;
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <>
          <Card id="a" />
          <Card id="b" />
        </>,
      ),
    );
    assertLog(['render a false', 'render b false']);

    // Both calls are checked; only the one whose comparison changed renders.
    await act(() => store.api.setState({selectedId: 'b'}));
    assertLog(['render b true']);
    expect(root).toMatchRenderedOutput('a[b]');

    selections = 0;
    await act(() => store.api.setState({other: 1}));
    assertLog([]);
    expect(selections).toBe(2 * uncheckedCalls);
  });

  // @gate enableContextSelectors && enableSelectorReads
  it('checks the calls whose reads are unknown on every change', async () => {
    const store = createStore({a: 0, b: 0});
    registerStoreHook(store.useStore, store.api.getState);
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <>
          <Value store={store} name="a" select={selectA} reads={null} />
          <Value store={store} name="b" select={selectB} reads={['b']} />
        </>,
      ),
    );
    assertLog(['render a 0', 'render b 0']);

    calls.a = 0;
    await act(() => store.api.setState({b: 1}));
    assertLog(['render b 1']);
    expect(calls.a).toBe(1);
  });

  // @gate enableContextSelectors && enableSelectorReads
  it('checks every call of a store hook registered without a state getter', async () => {
    const store = createStore({a: 0, b: 0});
    registerStoreHook(store.useStore);
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <>
          <Value store={store} name="a" select={selectA} reads={['a']} />
          <Value store={store} name="b" select={selectB} reads={['b']} />
        </>,
      ),
    );
    assertLog(['render a 0', 'render b 0']);

    calls.a = 0;
    await act(() => store.api.setState({b: 1}));
    assertLog(['render b 1']);
    expect(calls.a).toBe(1);
  });

  // @gate enableContextSelectors && enableSelectorReads
  it('checks every call when two state getters are registered for a store', async () => {
    const store = createStore({a: 0, b: 0});
    function useStoreA(selector) {
      return store.useStore(selector);
    }
    function useStoreB(selector) {
      return store.useStore(selector);
    }
    registerStoreHook(useStoreA, () => store.api.getState());
    registerStoreHook(useStoreB, () => store.api.getState());
    function A() {
      const a = useSelected(useStoreA, null, ['a'], selectA);
      Scheduler.log(`render a ${a}`);
      return a;
    }
    function B() {
      const b = useSelected(useStoreB, null, ['b'], selectB);
      Scheduler.log(`render b ${b}`);
      return b;
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <>
          <A />
          <B />
        </>,
      ),
    );
    assertLog(['render a 0', 'render b 0']);

    calls.a = 0;
    await act(() => store.api.setState({b: 1}));
    assertLog(['render b 1']);
    expect(calls.a).toBe(1);
  });

  // @gate enableContextSelectors && enableSelectorReads
  it('indexes a call under the keys of its last committed selector', async () => {
    const store = createStore({a: 0, b: 0});
    registerStoreHook(store.useStore, store.api.getState);
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <Value store={store} name="x" select={selectA} reads={['a']} />,
      ),
    );
    assertLog(['render x 0']);

    await act(() =>
      root.render(
        <Value store={store} name="x" select={selectB} reads={['b']} />,
      ),
    );
    assertLog(['render x 0']);

    calls.b = 0;
    await act(() => store.api.setState({a: 1}));
    assertLog([]);
    expect(calls.b).toBe(uncheckedCalls);

    await act(() => store.api.setState({b: 2}));
    assertLog(['render x 2']);
    expect(root).toMatchRenderedOutput('x2');
  });

  // @gate enableContextSelectors && enableSelectorReads
  it('does not commit the reads of a render that is not committed', async () => {
    const store = createStore({a: 0, b: 0});
    registerStoreHook(store.useStore, store.api.getState);
    const never = new Promise(() => {});
    function Suspend({suspend}) {
      if (suspend) {
        React.use(never);
      }
      return null;
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <>
          <Value store={store} name="x" select={selectA} reads={['a']} />
          <Suspend suspend={false} />
        </>,
      ),
    );
    assertLog(['render x 0']);

    // A transition renders with the selector of `b` and suspends, so it does
    // not commit.
    await act(async () => {
      React.startTransition(() =>
        root.render(
          <>
            <Value store={store} name="x" select={selectB} reads={['b']} />
            <Suspend suspend={true} />
          </>,
        ),
      );
      await waitFor(['render x 0']);
    });
    Scheduler.unstable_clearLog();

    // The committed reads are still those of `a`, so a change of `a` is
    // checked and renders the committed component. The transition is tried
    // again after the update.
    await act(() => store.api.setState({a: 1}));
    assertLog(['render x 1', 'render x 0']);
    expect(root).toMatchRenderedOutput('x1');
  });

  // @gate enableContextSelectors && enableSelectorReads
  it('checks the calls that read a key that was added or removed', async () => {
    const store = createStore({a: 0});
    registerStoreHook(store.useStore, store.api.getState);
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <>
          <Value store={store} name="a" select={selectA} reads={['a']} />
          <Value store={store} name="c" select={selectC} reads={['c']} />
        </>,
      ),
    );
    assertLog(['render a 0', 'render c undefined']);

    await act(() => store.api.setState({a: 0, c: 3}, true));
    assertLog(['render c 3']);

    await act(() => store.api.setState({a: 0}, true));
    assertLog(['render c undefined']);
    expect(root).toMatchRenderedOutput('a0cundefined');
  });

  // @gate enableContextSelectors && enableSelectorReads
  it('checks every call when the state is not a plain object', async () => {
    class State {
      constructor(a, b) {
        this.a = a;
        this.b = b;
      }
    }
    const store = createStore(new State(0, 0));
    registerStoreHook(store.useStore, store.api.getState);
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <>
          <Value store={store} name="a" select={selectA} reads={['a']} />
          <Value store={store} name="b" select={selectB} reads={['b']} />
        </>,
      ),
    );
    assertLog(['render a 0', 'render b 0']);

    calls.a = 0;
    await act(() => store.api.setState(new State(0, 1), true));
    assertLog(['render b 1']);
    expect(calls.a).toBe(1);
  });

  // @gate enableContextSelectors && enableSelectorReads
  it('removes the calls of unmounted components from the index', async () => {
    const store = createStore({a: 0, b: 0});
    registerStoreHook(store.useStore, store.api.getState);
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <>
          <Value store={store} name="a" select={selectA} reads={['a']} />
          <Value store={store} name="b" select={selectB} reads={['b']} />
        </>,
      ),
    );
    assertLog(['render a 0', 'render b 0']);

    await act(() =>
      root.render(
        <Value store={store} name="b" select={selectB} reads={['b']} />,
      ),
    );
    assertLog(['render b 0']);
    calls.a = 0;
    await act(() => store.api.setState({a: 1}));
    assertLog([]);
    expect(calls.a).toBe(0);

    await act(() => root.render(null));
    expect(store.api.listenerCount()).toBe(0);
    await act(() => store.api.setState({b: 1}));
    assertLog([]);

    await act(() =>
      root.render(
        <Value store={store} name="a" select={selectA} reads={['a']} />,
      ),
    );
    assertLog(['render a 1']);
    await act(() => store.api.setState({a: 2}));
    assertLog(['render a 2']);
  });

  // @gate enableContextSelectors && enableSelectorReads
  it('indexes the calls of components that subscribe again in StrictMode', async () => {
    const store = createStore({a: 0, b: 0});
    registerStoreHook(store.useStore, store.api.getState);
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <React.StrictMode>
          <Value store={store} name="a" select={selectA} reads={['a']} />
          <Value store={store} name="b" select={selectB} reads={['b']} />
        </React.StrictMode>,
      ),
    );
    Scheduler.unstable_clearLog();
    expect(store.api.listenerCount()).toBe(1);

    calls.a = 0;
    await act(() => store.api.setState({b: 1}));
    assertLog(['render b 1']);
    expect(calls.a).toBe(uncheckedCalls);
    expect(root).toMatchRenderedOutput('a0b1');

    await act(() => root.render(null));
    expect(store.api.listenerCount()).toBe(0);
  });

  // @gate enableContextSelectors && enableSelectorReads
  it('does not update a call whose selected value was mutated in place', async () => {
    const store = createStore({a: {n: 0}, b: 0});
    registerStoreHook(store.useStore, store.api.getState);
    const selectN = state => state.a.n;
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <Value store={store} name="n" select={selectN} reads={['a']} />,
      ),
    );
    assertLog(['render n 0']);

    // `a` is mutated instead of replaced, so the call is not checked.
    store.api.getState().a.n = 1;
    await act(() => store.api.setState({b: 1}));
    assertConsoleErrorDev([
      'The snapshot of a store hook changed although none of the ' +
        'top-level keys of the store state that its selector reads ' +
        'changed, so the component was not updated. Stores must ' +
        'replace the values they update instead of mutating them, ' +
        'and selectors must only read the state they are passed.',
    ]);
    assertLog([]);
    expect(root).toMatchRenderedOutput('n0');
  });
});
