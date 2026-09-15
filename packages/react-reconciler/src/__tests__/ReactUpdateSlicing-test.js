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
let waitFor;
let runtime;

// Components are written the way React Compiler emits calls of custom hooks
// with enableUpdateSlicing: between unstable_startSelectedHook and
// unstable_selectHookPaths, unstable_skipStoreHookN returns the hook itself
// unless React skipped the call.
describe('update slicing', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    ({act, assertLog, waitFor} = require('internal-test-utils'));
    runtime = require('react/compiler-runtime');
  });

  // A store and a bound hook implemented like Zustand's `create`, counting the
  // calls of the hook.
  function createStore(initial) {
    let state = initial;
    const listeners = new Set();
    const api = {
      getState: () => state,
      setState(partial) {
        const next = typeof partial === 'function' ? partial(state) : partial;
        state = {...state, ...next};
        listeners.forEach(listener => listener());
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      listenerCount: () => listeners.size,
    };
    const counts = {calls: 0};
    function useStore(selector) {
      counts.calls++;
      const slice = React.useSyncExternalStore(
        api.subscribe,
        React.useCallback(() => selector(api.getState()), [selector]),
      );
      React.useDebugValue(slice);
      return slice;
    }
    runtime.unstable_registerStoreHook(useStore);
    return {api, useStore, counts};
  }

  function useCalled(useHook, paths, argument) {
    const started = runtime.unstable_startSelectedHook(useHook);
    const skipped = runtime.unstable_skipStoreHook1(started, useHook, argument);
    const value = skipped !== useHook ? skipped : useHook(argument);
    return runtime.unstable_selectHookPaths(started, value, useHook, paths);
  }

  const selectTheme = state => state.theme;
  const selectCount = state => state.count;

  // @gate enableUpdateSlicing
  it('skips store hook calls whose arguments are unchanged', async () => {
    const store = createStore({theme: 'light', count: 0});
    function Card({id}) {
      const theme = useCalled(store.useStore, null, selectTheme);
      const count = useCalled(store.useStore, null, selectCount);
      Scheduler.log(`render ${id} ${theme} ${count}`);
      return `${id}:${theme}:${count} `;
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
    assertLog(['render a light 0', 'render b light 0']);
    expect(store.counts.calls).toBe(4);

    await act(() => store.api.setState({theme: 'dark'}));
    assertLog(['render a dark 0', 'render b dark 0']);
    expect(root).toMatchRenderedOutput('a:dark:0 b:dark:0 ');
    // No call of the hook: every call was skipped.
    expect(store.counts.calls).toBe(4);

    await act(() => store.api.setState(s => ({count: s.count + 1})));
    assertLog(['render a dark 1', 'render b dark 1']);
    expect(store.counts.calls).toBe(4);

    // Skipped calls keep their subscriptions and clean them up.
    expect(store.api.listenerCount()).toBe(1);
    await act(() => root.render(null));
    expect(store.api.listenerCount()).toBe(0);
  });

  // @gate enableUpdateSlicing
  it('calls the hook when an argument changed', async () => {
    const store = createStore({theme: 'light', count: 0});
    let setSuffix;
    function Card() {
      const [suffix, set] = React.useState('');
      setSuffix = set;
      // A new selector in every render.
      const theme = useCalled(store.useStore, null, s => s.theme + suffix);
      return theme;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Card />));
    expect(store.counts.calls).toBe(1);
    await act(() => setSuffix('!'));
    expect(root).toMatchRenderedOutput('light!');
    expect(store.counts.calls).toBe(2);
    await act(() => store.api.setState({theme: 'dark'}));
    expect(root).toMatchRenderedOutput('dark!');
    expect(store.counts.calls).toBe(3);
  });

  // @gate enableUpdateSlicing
  it('calls the hook when one of its hooks has an update', async () => {
    const store = createStore({theme: 'light'});
    let bump;
    // A registered store hook that also has state.
    function useStoreWithState(selector) {
      const [n, setN] = React.useState(0);
      bump = () => setN(x => x + 1);
      const slice = store.useStore(selector);
      Scheduler.log('hook state ' + n);
      return slice;
    }
    runtime.unstable_registerStoreHook(useStoreWithState);
    function Card() {
      return useCalled(useStoreWithState, null, selectTheme);
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Card />));
    assertLog(['hook state 0']);
    await act(() => store.api.setState({theme: 'dark'}));
    // Skipped: the state is unchanged.
    assertLog([]);
    expect(root).toMatchRenderedOutput('dark');
    await act(() => bump());
    assertLog(['hook state 1']);
    expect(root).toMatchRenderedOutput('dark');
    await act(() => store.api.setState({theme: 'light'}));
    assertLog([]);
    expect(root).toMatchRenderedOutput('light');
  });

  // @gate enableUpdateSlicing
  it('calls the hook when a context it read changed', async () => {
    const store = createStore({theme: 'light'});
    const Prefix = React.createContext('');
    function useStoreWithContext(selector) {
      const prefix = React.useContext(Prefix);
      Scheduler.log('hook prefix ' + prefix);
      return store.useStore(selector);
    }
    runtime.unstable_registerStoreHook(useStoreWithContext);
    let setPrefix;
    function App() {
      const [prefix, set] = React.useState('');
      setPrefix = set;
      return (
        <Prefix.Provider value={prefix}>
          <Card />
        </Prefix.Provider>
      );
    }
    const Card = React.memo(function Card() {
      return useCalled(useStoreWithContext, null, selectTheme);
    });
    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['hook prefix ']);
    await act(() => store.api.setState({theme: 'dark'}));
    assertLog([]);
    expect(root).toMatchRenderedOutput('dark');
    // The skipped call still depends on the context.
    await act(() => setPrefix('>'));
    assertLog(['hook prefix >']);
  });

  // @gate enableUpdateSlicing
  it('runs the effects of a skipped call like the effects of a call', async () => {
    const store = createStore({theme: 'light', count: 0});
    function useStoreWithEffect(selector) {
      React.useEffect(() => {
        Scheduler.log('effect');
        return () => Scheduler.log('cleanup');
      }, [selector]);
      return store.useStore(selector);
    }
    runtime.unstable_registerStoreHook(useStoreWithEffect);
    function Card() {
      return useCalled(useStoreWithEffect, null, selectTheme);
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Card />));
    assertLog(['effect']);
    await act(() => store.api.setState({theme: 'dark'}));
    assertLog([]);
    await act(() => store.api.setState({theme: 'light'}));
    assertLog([]);
    await act(() => root.render(null));
    assertLog(['cleanup']);
    expect(store.api.listenerCount()).toBe(0);
  });

  // @gate enableUpdateSlicing
  it('renders consistently when the store changes during a concurrent render', async () => {
    const store = createStore({theme: 'light'});
    function Card({id}) {
      const theme = useCalled(store.useStore, null, selectTheme);
      Scheduler.log(`render ${id} ${theme}`);
      return `${id}:${theme} `;
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
    assertLog(['render a light', 'render b light']);
    await act(() => store.api.setState({theme: 'dark'}));
    assertLog(['render a dark', 'render b dark']);
    expect(root).toMatchRenderedOutput('a:dark b:dark ');
    // A transition renders "a" with a skipped call, then the store changes
    // before the transition commits: the render is done again.
    await act(async () => {
      React.startTransition(() =>
        root.render(
          <>
            <Card id="a" />
            <Card id="b" />
            <Card id="c" />
          </>,
        ),
      );
      await waitFor(['render a dark']);
      store.api.setState({theme: 'blue'});
    });
    Scheduler.unstable_clearLog();
    expect(root).toMatchRenderedOutput('a:blue b:blue c:blue ');
    expect(store.counts.calls).toBeLessThan(6);
  });

  // @gate enableUpdateSlicing
  it('calls the hook when the snapshot is the hook itself', async () => {
    const store = createStore({theme: 'light', hook: null});
    store.api.setState({hook: store.useStore});
    const selectHook = state => state.hook;
    function Card() {
      const hook = useCalled(store.useStore, null, selectHook);
      const theme = useCalled(store.useStore, null, selectTheme);
      return hook === store.useStore ? theme : 'other';
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Card />));
    expect(store.counts.calls).toBe(2);
    await act(() => store.api.setState({theme: 'dark'}));
    expect(root).toMatchRenderedOutput('dark');
    // The call returning the hook is made; the other is skipped.
    expect(store.counts.calls).toBe(3);
  });

  // @gate enableUpdateSlicing
  it('does not skip in StrictMode in development', async () => {
    const store = createStore({theme: 'light'});
    function Card() {
      return useCalled(store.useStore, null, selectTheme);
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <React.StrictMode>
          <Card />
        </React.StrictMode>,
      ),
    );
    const calls = store.counts.calls;
    await act(() => store.api.setState({theme: 'dark'}));
    expect(root).toMatchRenderedOutput('dark');
    if (__DEV__) {
      expect(store.counts.calls).toBeGreaterThan(calls);
    } else {
      expect(store.counts.calls).toBe(calls);
    }
  });

  // @gate enableUpdateSlicing
  it('keeps skipped hooks when a hidden tree is shown again', async () => {
    const store = createStore({theme: 'light'});
    const Activity = React.Activity;
    function Card() {
      return useCalled(store.useStore, null, selectTheme);
    }
    function App({mode}) {
      return (
        <Activity mode={mode}>
          <Card />
        </Activity>
      );
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<App mode="visible" />));
    await act(() => store.api.setState({theme: 'dark'}));
    expect(root).toMatchRenderedOutput('dark');
    await act(() => root.render(<App mode="hidden" />));
    // Changed while hidden (not subscribed).
    await act(() => store.api.setState({theme: 'blue'}));
    await act(() => root.render(<App mode="visible" />));
    expect(root).toMatchRenderedOutput('blue');
    await act(() => store.api.setState({theme: 'green'}));
    expect(root).toMatchRenderedOutput('green');
  });
});
