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
let registerStoreHook;
let startSelectedHook;
let selectHookPaths;

// Components are written the way React Compiler emits reads of store hooks
// with enableContextSelectors: `paths` describes every value of the returned
// snapshot that the component reads.
describe('selected store hooks', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    ({act, assertLog, waitFor} = require('internal-test-utils'));
    const runtime = require('react/compiler-runtime');
    registerStoreHook = runtime.unstable_registerStoreHook;
    startSelectedHook = runtime.unstable_startSelectedHook;
    selectHookPaths = runtime.unstable_selectHookPaths;
  });

  // A store and a bound hook implemented like Zustand's `create`.
  function createStore(initial) {
    let state = initial;
    const listeners = new Set();
    const api = {
      getState: () => state,
      setState(updater) {
        const next = typeof updater === 'function' ? updater(state) : updater;
        if (!Object.is(next, state)) {
          state = {...state, ...next};
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
      const slice = React.useSyncExternalStore(
        api.subscribe,
        React.useCallback(() => selector(api.getState()), [selector]),
      );
      React.useDebugValue(slice);
      return slice;
    }
    return {api, useStore};
  }

  function useSelected(useHook, paths, ...args) {
    const started = startSelectedHook(useHook);
    const value = useHook(...args);
    return selectHookPaths(started, value, useHook, paths);
  }

  const selectSelectedId = state => state.selectedId;
  const selectCard = state => state.card;

  // @gate enableContextSelectors
  it('renders a component only when its selection of the snapshot changes', async () => {
    const store = createStore({selectedId: null, other: 0});
    registerStoreHook(store.useStore);
    function Card({id}) {
      const selectedId = useSelected(
        store.useStore,
        [[1, id]],
        selectSelectedId,
      );
      const isSelected = selectedId === id;
      Scheduler.log(`render ${id} ${isSelected}`);
      return isSelected ? `[${id}]` : id;
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <>
          <Card id="a" />
          <Card id="b" />
          <Card id="c" />
        </>,
      ),
    );
    assertLog(['render a false', 'render b false', 'render c false']);

    await act(() => store.api.setState({selectedId: 'b'}));
    assertLog(['render b true']);
    expect(root).toMatchRenderedOutput('a[b]c');

    await act(() => store.api.setState({selectedId: 'c'}));
    assertLog(['render b false', 'render c true']);
    expect(root).toMatchRenderedOutput('ab[c]');

    // Snapshots that compare the same (a new card object) are not a change.
    await act(() => store.api.setState({other: 1}));
    assertLog([]);
  });

  // @gate enableContextSelectors
  it('compares with the value of the last committed render', async () => {
    const store = createStore({card: {title: 'x', points: 1}});
    registerStoreHook(store.useStore);
    function Title() {
      const card = useSelected(store.useStore, [[0, 'title']], selectCard);
      Scheduler.log('render ' + card.title);
      return card.title;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Title />));
    assertLog(['render x']);

    // Skipped: the component keeps the snapshot it rendered with, so the next
    // comparison is against it.
    await act(() => store.api.setState(s => ({card: {...s.card, points: 2}})));
    assertLog([]);
    await act(() => store.api.setState(s => ({card: {...s.card, title: 'y'}})));
    assertLog(['render y']);
    await act(() => store.api.setState(s => ({card: {...s.card, title: 'x'}})));
    assertLog(['render x']);
    expect(root).toMatchRenderedOutput('x');
  });

  // @gate enableContextSelectors
  it('commits operands of the selection with the render', async () => {
    const store = createStore({selectedId: 'b'});
    registerStoreHook(store.useStore);
    function Card({id}) {
      const selectedId = useSelected(
        store.useStore,
        [[1, id]],
        selectSelectedId,
      );
      Scheduler.log(`render ${id} ${selectedId === id}`);
      return selectedId === id ? `[${id}]` : id;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Card id="a" />));
    assertLog(['render a false']);

    await act(() => root.render(<Card id="c" />));
    assertLog(['render c false']);

    // Selecting "a" does not change the selection of "c".
    await act(() => store.api.setState({selectedId: 'a'}));
    assertLog([]);
    await act(() => store.api.setState({selectedId: 'c'}));
    assertLog(['render c true']);
    expect(root).toMatchRenderedOutput('[c]');
  });

  // @gate enableContextSelectors
  it('does not commit the selection of a render that is not committed', async () => {
    const store = createStore({selectedId: null});
    registerStoreHook(store.useStore);
    function Card({id}) {
      const selectedId = useSelected(
        store.useStore,
        [[1, id]],
        selectSelectedId,
      );
      Scheduler.log(`render ${id} ${selectedId === id}`);
      return selectedId === id ? `[${id}]` : id;
    }
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
          <Card id="a" />
          <Suspend suspend={false} />
        </>,
      ),
    );
    assertLog(['render a false']);

    // A transition renders with "b" and suspends, so it does not commit.
    await act(async () => {
      React.startTransition(() =>
        root.render(
          <>
            <Card id="b" />
            <Suspend suspend={true} />
          </>,
        ),
      );
      await waitFor(['render b false']);
    });
    Scheduler.unstable_clearLog();
    expect(root).toMatchRenderedOutput('a');

    // The committed selection is still the one of "a". The transition is
    // tried again after the update.
    await act(() => store.api.setState({selectedId: 'a'}));
    assertLog(['render a true', 'render b false']);
    expect(root).toMatchRenderedOutput('[a]');
  });

  // @gate enableContextSelectors
  it('reads the latest snapshot when it renders for another reason', async () => {
    const store = createStore({card: {title: 'x', points: 1}});
    registerStoreHook(store.useStore);
    let setCount;
    function Card() {
      const [count, set] = React.useState(0);
      setCount = set;
      const card = useSelected(store.useStore, [[0, 'title']], selectCard);
      return `${card.title} ${card.points} ${count}`;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Card />));
    await act(() => store.api.setState(s => ({card: {...s.card, points: 2}})));
    // Not rendered: the render only reads the title in the compiler's
    // description, so this component is not what the compiler would emit.
    expect(root).toMatchRenderedOutput('x 1 0');
    await act(() => setCount(1));
    expect(root).toMatchRenderedOutput('x 2 1');
  });

  // @gate enableContextSelectors
  it('renders for changes between render and commit', async () => {
    const store = createStore({selectedId: null});
    registerStoreHook(store.useStore);
    function Card({id}) {
      const selectedId = useSelected(
        store.useStore,
        [[1, id]],
        selectSelectedId,
      );
      Scheduler.log(`render ${id} ${selectedId === id}`);
      return selectedId === id ? `[${id}]` : id;
    }
    function SelectOnMount() {
      React.useLayoutEffect(() => {
        store.api.setState({selectedId: 'a'});
      }, []);
      return null;
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <>
          <Card id="a" />
          <SelectOnMount />
        </>,
      ),
    );
    assertLog(['render a false', 'render a true']);
    expect(root).toMatchRenderedOutput('[a]');
  });

  // @gate enableContextSelectors
  it('renders consistently when the store changes during a concurrent render', async () => {
    const store = createStore({selectedId: null, other: 0});
    registerStoreHook(store.useStore);
    function Card({id}) {
      const selectedId = useSelected(
        store.useStore,
        [[1, id]],
        selectSelectedId,
      );
      Scheduler.log(`render ${id} ${selectedId === id}`);
      return selectedId === id ? `[${id}]` : id;
    }
    const root = ReactNoop.createRoot();
    await act(async () => {
      React.startTransition(() =>
        root.render(
          <>
            <Card id="a" />
            <Card id="b" />
          </>,
        ),
      );
      await waitFor(['render a false']);
      store.api.setState({selectedId: 'a'});
    });
    // The render is restarted synchronously because "a" read a stale
    // snapshot.
    assertLog(['render b false', 'render a true', 'render b false']);
    expect(root).toMatchRenderedOutput('[a]b');
  });

  // @gate enableContextSelectors
  it('treats a snapshot that throws as a change', async () => {
    const store = createStore({card: {title: 'x'}});
    registerStoreHook(store.useStore);
    const selectTitle = state => {
      if (state.card === null) {
        throw new Error('No card');
      }
      return state.card;
    };
    function Title() {
      const card = useSelected(store.useStore, [[0, 'title']], selectTitle);
      Scheduler.log('render ' + card.title);
      return card.title;
    }
    class Boundary extends React.Component {
      state = {error: null};
      static getDerivedStateFromError(error) {
        return {error};
      }
      render() {
        return this.state.error
          ? this.state.error.message
          : this.props.children;
      }
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <Boundary>
          <Title />
        </Boundary>,
      ),
    );
    assertLog(['render x']);
    await act(() => store.api.setState({card: null}));
    expect(root).toMatchRenderedOutput('No card');
  });

  describe('verification', () => {
    // Renders a component that selects `a` of the value returned by the hook
    // and returns the renders caused by a change of `b`.
    async function unrelatedRenders(createHook, register) {
      const store = createStore({value: {a: 0, b: 0}});
      const useHook = createHook(store);
      if (register) {
        registerStoreHook(useHook);
      }
      const selectValue = state => state.value;
      function Consumer() {
        const value = useSelected(useHook, [[0, 'a']], selectValue);
        Scheduler.log('render ' + value.a);
        return value.a;
      }
      const root = ReactNoop.createRoot();
      await act(() => root.render(<Consumer />));
      assertLog(['render 0']);
      await act(() =>
        store.api.setState(s => ({value: {...s.value, b: s.value.b + 1}})),
      );
      const unrelated = Scheduler.unstable_clearLog();
      await act(() =>
        store.api.setState(s => ({value: {...s.value, a: s.value.a + 1}})),
      );
      assertLog(['render 1']);
      expect(root).toMatchRenderedOutput('1');
      return unrelated;
    }

    // @gate enableContextSelectors
    it('selects the snapshot returned by a registered store hook', async () => {
      expect(await unrelatedRenders(store => store.useStore, true)).toEqual([]);
    });

    // @gate enableContextSelectors
    it('does not select the value of a hook that is not registered', async () => {
      expect(await unrelatedRenders(store => store.useStore, false)).toEqual([
        'render 0',
      ]);
    });

    // @gate enableContextSelectors
    it('does not select when the hook returns another value', async () => {
      expect(
        await unrelatedRenders(
          store => selector => ({...store.useStore(selector)}),
          true,
        ),
      ).toEqual(['render 0']);
    });

    // @gate enableContextSelectors
    it('does not select when the hook reads two stores', async () => {
      const other = createStore({x: 0});
      const selectX = state => state.x;
      expect(
        await unrelatedRenders(
          store => selector => {
            other.useStore(selectX);
            return store.useStore(selector);
          },
          true,
        ),
      ).toEqual(['render 0']);
    });

    // @gate enableContextSelectors
    it('stops selecting when the hook stops returning the snapshot', async () => {
      const store = createStore({value: {a: 0, b: 0}});
      // Not a valid store hook: which value it returns does not only depend on
      // the snapshot. React stops selecting when a render returns another
      // value.
      let copy = false;
      function useHook(selector) {
        const value = store.useStore(selector);
        return copy ? {...value} : value;
      }
      registerStoreHook(useHook);
      const selectValue = state => state.value;
      function Consumer() {
        const value = useSelected(useHook, [[0, 'a']], selectValue);
        Scheduler.log('render ' + value.a);
        return value.a;
      }
      const root = ReactNoop.createRoot();
      await act(() => root.render(<Consumer />));
      assertLog(['render 0']);
      await act(() =>
        store.api.setState(s => ({value: {...s.value, b: s.value.b + 1}})),
      );
      assertLog([]);

      copy = true;
      await act(() =>
        store.api.setState(s => ({value: {...s.value, a: s.value.a + 1}})),
      );
      assertLog(['render 1']);
      await act(() =>
        store.api.setState(s => ({value: {...s.value, b: s.value.b + 1}})),
      );
      assertLog(['render 1']);
    });
  });
  describe('shared subscriptions', () => {
    function Card({store, id}) {
      const selectedId = useSelected(
        store.useStore,
        [[1, id]],
        selectSelectedId,
      );
      Scheduler.log(`render ${id} ${selectedId === id}`);
      return selectedId === id ? `[${id}]` : id;
    }

    // @gate enableContextSelectors
    it('subscribes once per store for the components of registered store hooks', async () => {
      const store = createStore({selectedId: null});
      registerStoreHook(store.useStore);
      const other = createStore({x: 0});
      function Plain() {
        const x = React.useSyncExternalStore(
          other.api.subscribe,
          () => other.api.getState().x,
        );
        return x;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <>
            <Card store={store} id="a" />
            <Card store={store} id="b" />
            <Card store={store} id="c" />
            <Plain />
            <Plain />
          </>,
        ),
      );
      Scheduler.unstable_clearLog();
      expect(store.api.listenerCount()).toBe(1);
      // Other subscriptions are unchanged.
      expect(other.api.listenerCount()).toBe(2);

      await act(() => store.api.setState({selectedId: 'b'}));
      assertLog(['render b true']);
      expect(root).toMatchRenderedOutput('a[b]c00');

      await act(() =>
        root.render(
          <>
            <Card store={store} id="a" />
            <Card store={store} id="b" />
          </>,
        ),
      );
      Scheduler.unstable_clearLog();
      expect(store.api.listenerCount()).toBe(1);
      await act(() => store.api.setState({selectedId: 'a'}));
      assertLog(['render a true', 'render b false']);

      await act(() => root.render(null));
      expect(store.api.listenerCount()).toBe(0);
      expect(other.api.listenerCount()).toBe(0);

      await act(() => root.render(<Card store={store} id="a" />));
      assertLog(['render a true']);
      expect(store.api.listenerCount()).toBe(1);
      await act(() => store.api.setState({selectedId: null}));
      assertLog(['render a false']);
    });

    // @gate enableContextSelectors
    it('shares the subscribe function of a store hook with unselected reads', async () => {
      const store = createStore({selectedId: null, count: 0});
      registerStoreHook(store.useStore);
      const selectCount = state => state.count;
      function Count() {
        // Not selected: the value is rendered whole.
        const count = store.useStore(selectCount);
        Scheduler.log('count ' + count);
        return count;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <>
            <Card store={store} id="a" />
            <Count />
            <Count />
          </>,
        ),
      );
      assertLog(['render a false', 'count 0', 'count 0']);
      expect(store.api.listenerCount()).toBe(1);
      await act(() => store.api.setState(s => ({count: s.count + 1})));
      assertLog(['count 1', 'count 1']);
      expect(root).toMatchRenderedOutput('a11');
      await act(() => root.render(<Count />));
      assertLog(['count 1']);
      expect(store.api.listenerCount()).toBe(1);
      await act(() => store.api.setState(s => ({count: s.count + 1})));
      assertLog(['count 2']);
      await act(() => root.render(null));
      expect(store.api.listenerCount()).toBe(0);
    });

    // @gate enableContextSelectors
    it('shares subscriptions across roots', async () => {
      const store = createStore({selectedId: null});
      registerStoreHook(store.useStore);
      const first = ReactNoop.createRoot();
      const second = ReactNoop.createRoot();
      await act(() => first.render(<Card store={store} id="a" />));
      assertLog(['render a false']);
      await act(() => second.render(<Card store={store} id="b" />));
      assertLog(['render b false']);
      expect(store.api.listenerCount()).toBe(1);
      await act(() => store.api.setState({selectedId: 'b'}));
      assertLog(['render b true']);
      await act(() => first.render(null));
      expect(store.api.listenerCount()).toBe(1);
      await act(() => store.api.setState({selectedId: null}));
      assertLog(['render b false']);
      await act(() => second.render(null));
      expect(store.api.listenerCount()).toBe(0);
    });

    // @gate enableContextSelectors
    it('handles components unsubscribing while the store notifies', async () => {
      const store = createStore({selectedId: null, hidden: false});
      registerStoreHook(store.useStore);
      const root = ReactNoop.createRoot();
      // A selector that synchronously unmounts components when the store
      // changes, which render purity does not allow, but must not corrupt the
      // subscriptions of the other components.
      const selectAndUnmount = state => {
        if (state.hidden && !unmounted) {
          unmounted = true;
          ReactNoop.flushSync(() => root.render(<Card store={store} id="c" />));
        }
        return state.selectedId;
      };
      let unmounted = false;
      function Unmounting({id}) {
        const selectedId = useSelected(
          store.useStore,
          [[1, id]],
          selectAndUnmount,
        );
        return selectedId === id ? `[${id}]` : id;
      }
      await act(() =>
        root.render(
          <>
            <Unmounting id="a" />
            <Unmounting id="b" />
            <Card store={store} id="c" />
          </>,
        ),
      );
      Scheduler.unstable_clearLog();
      expect(store.api.listenerCount()).toBe(1);
      await act(() => store.api.setState({hidden: true}));
      Scheduler.unstable_clearLog();
      expect(root).toMatchRenderedOutput('c');
      expect(store.api.listenerCount()).toBe(1);
      await act(() => store.api.setState({selectedId: 'c'}));
      assertLog(['render c true']);
      expect(root).toMatchRenderedOutput('[c]');
      await act(() => root.render(null));
      expect(store.api.listenerCount()).toBe(0);
    });

    // @gate enableContextSelectors
    it('subscribes again in StrictMode', async () => {
      const store = createStore({selectedId: null});
      registerStoreHook(store.useStore);
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <React.StrictMode>
            <Card store={store} id="a" />
            <Card store={store} id="b" />
          </React.StrictMode>,
        ),
      );
      Scheduler.unstable_clearLog();
      expect(store.api.listenerCount()).toBe(1);
      await act(() => store.api.setState({selectedId: 'a'}));
      assertLog(['render a true']);
      expect(root).toMatchRenderedOutput('[a]b');
      await act(() => root.render(null));
      expect(store.api.listenerCount()).toBe(0);
    });
  });
});
