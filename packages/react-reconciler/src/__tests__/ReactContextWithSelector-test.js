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
let useContextWithSelector;
let registerContextHook;
let startSelectedHook;
let selectHookResult;

// Components are written the way React Compiler emits context reads with
// enableContextSelectors: the selector reads every value of the context that
// the component reads.
describe('unstable_useContextWithSelector', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    ({act, assertLog, waitFor} = require('internal-test-utils'));
    const runtime = require('react/compiler-runtime');
    useContextWithSelector = runtime.unstable_useContextWithSelector;
    registerContextHook = runtime.unstable_registerContextHook;
    startSelectedHook = runtime.unstable_startSelectedHook;
    selectHookResult = runtime.unstable_selectHookResult;
  });

  function createStore(initial) {
    const Context = React.createContext(initial);
    let setValue;
    function Provider({children}) {
      const [value, set] = React.useState(initial);
      setValue = set;
      return <Context.Provider value={value}>{children}</Context.Provider>;
    }
    return {Context, Provider, update: updater => setValue(updater)};
  }

  // @gate enableContextSelectors
  it('renders a consumer only when its selected values change', async () => {
    const store = createStore({count: 0, label: 'a', unrelated: 0});
    function Consumer() {
      const value = useContextWithSelector(store.Context, v => [
        v.count,
        v.label,
      ]);
      Scheduler.log(`render ${value.label}${value.count}`);
      return `${value.label}${value.count}`;
    }
    const Static = React.memo(() => <Consumer />);
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <store.Provider>
          <Static />
        </store.Provider>,
      ),
    );
    assertLog(['render a0']);

    await act(() => store.update(v => ({...v, unrelated: v.unrelated + 1})));
    assertLog([]);
    expect(root).toMatchRenderedOutput('a0');

    await act(() => store.update(v => ({...v, count: 1})));
    assertLog(['render a1']);
    expect(root).toMatchRenderedOutput('a1');

    await act(() => store.update(v => ({...v, label: 'b'})));
    assertLog(['render b1']);
    expect(root).toMatchRenderedOutput('b1');
  });

  // @gate enableContextSelectors
  it('uses the selector of the last render, which can capture props', async () => {
    const store = createStore({selected: 'x', starred: {}});
    function Item({id}) {
      const value = useContextWithSelector(store.Context, v => [
        v.selected === id,
        v.starred[id] === true,
      ]);
      const text = `${id}${value.selected === id ? '*' : ''}${
        value.starred[id] === true ? '!' : ''
      }`;
      Scheduler.log('render ' + text);
      return text;
    }
    const List = React.memo(({ids}) =>
      ids.map(id => <Item key={id} id={id} />),
    );
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <store.Provider>
          <List ids={['x', 'y', 'z']} />
        </store.Provider>,
      ),
    );
    assertLog(['render x*', 'render y', 'render z']);

    // Selecting y renders x and y only.
    await act(() => store.update(v => ({...v, selected: 'y'})));
    assertLog(['render x', 'render y*']);
    expect(root).toMatchRenderedOutput('xy*z');

    // Starring z renders z only, although `starred` is a new object.
    await act(() => store.update(v => ({...v, starred: {z: true}})));
    assertLog(['render z!']);
    expect(root).toMatchRenderedOutput('xy*z!');
  });

  // @gate enableContextSelectors
  it('treats a selector that throws as a change', async () => {
    const store = createStore({user: {name: 'Ada'}, tick: 0});
    function Name() {
      const value = useContextWithSelector(store.Context, v => [v.user.name]);
      Scheduler.log('render');
      return value.user === null ? 'nobody' : value.user.name;
    }
    const Static = React.memo(() => <Name />);
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <store.Provider>
          <Static />
        </store.Provider>,
      ),
    );
    assertLog(['render']);
    await act(() => store.update(v => ({...v, user: null})));
    assertLog(['render']);
    expect(root).toMatchRenderedOutput('nobody');
    // The selector threw when the value was read: every change renders.
    await act(() => store.update(v => ({...v, tick: 1})));
    assertLog(['render']);
    await act(() => store.update(v => ({...v, user: {name: 'Grace'}})));
    assertLog(['render']);
    expect(root).toMatchRenderedOutput('Grace');
    await act(() => store.update(v => ({...v, tick: 2})));
    assertLog([]);
  });

  // @gate enableContextSelectors
  it('bails out of a memo consumer whose props and selected values are unchanged', async () => {
    const store = createStore({a: 0, b: 0});
    const Consumer = React.memo(function Consumer({suffix}) {
      const value = useContextWithSelector(store.Context, v => [v.a]);
      Scheduler.log('render ' + value.a + suffix);
      return value.a + suffix;
    });
    let setSuffix;
    function Parent() {
      const [suffix, set] = React.useState('!');
      setSuffix = set;
      Scheduler.log('parent');
      return <Consumer suffix={suffix} />;
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <store.Provider>
          <Parent />
        </store.Provider>,
      ),
    );
    assertLog(['parent', 'render 0!']);
    // The parent renders with the same props in the same update as a change
    // of an unselected value: the consumer bails out.
    await act(() => {
      store.update(v => ({...v, b: 1}));
      setSuffix('!');
    });
    assertLog([]);
    await act(() => {
      store.update(v => ({...v, a: 1, b: 2}));
      setSuffix('?');
    });
    assertLog(['parent', 'render 1?']);
    expect(root).toMatchRenderedOutput('1?');
  });

  // @gate enableContextSelectors
  it('renders once with the latest values when state and context change together', async () => {
    const store = createStore({a: 0});
    let setLocal;
    function Consumer() {
      const [local, set] = React.useState(0);
      setLocal = set;
      const value = useContextWithSelector(store.Context, v => [v.a]);
      Scheduler.log(`render ${value.a} ${local}`);
      return `${value.a} ${local}`;
    }
    const Static = React.memo(() => <Consumer />);
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <store.Provider>
          <Static />
        </store.Provider>,
      ),
    );
    assertLog(['render 0 0']);
    await act(() => {
      setLocal(1);
      store.update(v => ({a: 1}));
    });
    assertLog(['render 1 1']);
    expect(root).toMatchRenderedOutput('1 1');
  });

  // @gate enableContextSelectors
  it('reads the nearest provider', async () => {
    const outer = createStore({a: 0});
    function Consumer({label}) {
      const value = useContextWithSelector(outer.Context, v => [v.a]);
      Scheduler.log(`render ${label} ${value.a}`);
      return `${label}${value.a} `;
    }
    const Tree = React.memo(() => (
      <>
        <Consumer label="outer" />
        <outer.Context.Provider value={{a: 'inner'}}>
          <Consumer label="inner" />
        </outer.Context.Provider>
      </>
    ));
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <outer.Provider>
          <Tree />
        </outer.Provider>,
      ),
    );
    assertLog(['render outer 0', 'render inner inner']);
    // Like useContext, propagation schedules consumers below a nested provider
    // of the same context. Their selectors are called with the changed outer
    // value, so they can render needlessly (never too little: a change of the
    // nested provider's value is propagated by the nested provider).
    await act(() => outer.update(() => ({a: 1})));
    assertLog(['render outer 1', 'render inner inner']);
    expect(root).toMatchRenderedOutput('outer1 innerinner ');
    await act(() => outer.update(() => ({a: 'inner'})));
    assertLog(['render outer inner']);
  });

  // @gate enableContextSelectors
  it('selects against the value of the render in progress in transitions', async () => {
    const store = createStore({a: 0, b: 0});
    function A() {
      const value = useContextWithSelector(store.Context, v => [v.a]);
      Scheduler.log('A' + value.a);
      return 'A' + value.a;
    }
    function B() {
      const value = useContextWithSelector(store.Context, v => [v.b]);
      Scheduler.log('B' + value.b);
      return 'B' + value.b;
    }
    const Static = React.memo(() => (
      <>
        <A />
        <B />
      </>
    ));
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <store.Provider>
          <Static />
        </store.Provider>,
      ),
    );
    assertLog(['A0', 'B0']);

    await act(async () => {
      React.startTransition(() => store.update(v => ({...v, a: 1})));
      await waitFor(['A1']);
      store.update(v => ({...v, b: 1}));
    });
    // The transition finishes without rendering B, whose selected value is the
    // same in the transition's value, then the second update renders B.
    assertLog(['B1']);
    expect(root).toMatchRenderedOutput('A1B1');
  });

  // @gate enableContextSelectors
  it('renders in StrictMode like useContext when selected values change', async () => {
    async function logs(readContext) {
      const store = createStore({a: 0, b: 0});
      function Consumer() {
        const value = readContext(store.Context);
        Scheduler.log('render ' + value.a);
        return value.a;
      }
      const Static = React.memo(() => <Consumer />);
      const root = ReactNoop.createRoot();
      const result = [];
      await act(() =>
        root.render(
          <React.StrictMode>
            <store.Provider>
              <Static />
            </store.Provider>
          </React.StrictMode>,
        ),
      );
      result.push(Scheduler.unstable_clearLog());
      await act(() => store.update(v => ({...v, a: 1})));
      result.push(Scheduler.unstable_clearLog());
      await act(() => store.update(v => ({...v, b: 1})));
      result.push(Scheduler.unstable_clearLog());
      expect(root).toMatchRenderedOutput('1');
      return result;
    }
    const [mount, change, unrelated] = await logs(Context =>
      useContextWithSelector(Context, v => [v.a]),
    );
    const [mountWithContext, changeWithContext] = await logs(Context =>
      React.useContext(Context),
    );
    expect(mount).toEqual(mountWithContext);
    expect(change).toEqual(changeWithContext);
    expect(unrelated).toEqual([]);
  });

  describe('custom hooks', () => {
    // Renders `useHook()` the way the compiler emits a selected custom hook
    // call, and logs each render.
    async function renderCounts(useHook, register) {
      const store = createStore({a: 0, b: 0});
      const Other = React.createContext(0);
      if (register) {
        registerContextHook(useHook);
      }
      function Consumer() {
        const token = startSelectedHook(useHook);
        const value = selectHookResult(
          token,
          useHook(store.Context, Other),
          useHook,
          v => [v.a],
        );
        Scheduler.log('render ' + value.a);
        return value.a;
      }
      const Static = React.memo(() => <Consumer />);
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <store.Provider>
            <Static />
          </store.Provider>,
        ),
      );
      assertLog(['render 0']);
      await act(() => store.update(v => ({...v, b: 1})));
      const unrelated = Scheduler.unstable_clearLog();
      await act(() => store.update(v => ({...v, a: 1})));
      assertLog(['render 1']);
      expect(root).toMatchRenderedOutput('1');
      return unrelated;
    }

    // @gate enableContextSelectors
    it('selects the value returned by a registered context hook', async () => {
      function useStore(Context) {
        const value = React.useContext(Context);
        if (value === null) {
          throw new Error('Missing provider');
        }
        return value;
      }
      expect(await renderCounts(useStore, true)).toEqual([]);
    });

    // @gate enableContextSelectors
    it('selects through a registered hook that calls another custom hook', async () => {
      function useInner(Context) {
        return React.useContext(Context);
      }
      function useOuter(Context) {
        return useInner(Context);
      }
      expect(await renderCounts(useOuter, true)).toEqual([]);
    });

    // @gate enableContextSelectors
    it('does not select the value of a hook that is not registered', async () => {
      function useStore(Context) {
        return React.useContext(Context);
      }
      expect(await renderCounts(useStore, false)).toEqual(['render 0']);
    });

    // @gate enableContextSelectors
    it('does not select when the hook calls other hooks', async () => {
      function useStore(Context) {
        React.useState(0);
        return React.useContext(Context);
      }
      expect(await renderCounts(useStore, true)).toEqual(['render 0']);
    });

    // @gate enableContextSelectors
    it('does not select when the hook reads another context', async () => {
      function useStore(Context, Other) {
        React.useContext(Other);
        return React.useContext(Context);
      }
      expect(await renderCounts(useStore, true)).toEqual(['render 0']);
    });

    // @gate enableContextSelectors
    it('does not select when the hook returns another value', async () => {
      function useStore(Context) {
        const value = React.useContext(Context);
        return {...value};
      }
      expect(await renderCounts(useStore, true)).toEqual(['render 0']);
    });
  });

  // @gate enableContextSelectors
  it('selects paths described as data', async () => {
    const {
      unstable_useContextPaths: useContextPaths,
    } = require('react/compiler-runtime');
    const store = createStore({
      selectedId: 'x',
      starred: {},
      user: null,
      theme: 'light',
    });
    function Item({id}) {
      const value = useContextPaths(store.Context, [
        [1, id, 'selectedId'],
        [0, 'starred', id],
        [0, 'user', 'name'],
      ]);
      const text = `${id}${value.selectedId === id ? '*' : ''}${
        value.starred[id] ? '!' : ''
      }${value.user === null ? '' : value.user.name}`;
      Scheduler.log(text);
      return text + ' ';
    }
    const List = React.memo(() =>
      ['x', 'y'].map(id => <Item key={id} id={id} />),
    );
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <store.Provider>
          <List />
        </store.Provider>,
      ),
    );
    assertLog(['x*', 'y']);
    await act(() => store.update(v => ({...v, theme: 'dark'})));
    assertLog([]);
    await act(() => store.update(v => ({...v, selectedId: 'y'})));
    assertLog(['x', 'y*']);
    await act(() => store.update(v => ({...v, starred: {x: true}})));
    assertLog(['x!']);
    await act(() => store.update(v => ({...v, user: {name: 'Ada'}})));
    assertLog(['x!Ada', 'y*Ada']);
    expect(root).toMatchRenderedOutput('x!Ada y*Ada ');
  });
});
