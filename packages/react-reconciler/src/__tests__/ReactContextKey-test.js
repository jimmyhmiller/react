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
let React, ReactNoop, Scheduler, act, assertLog, waitFor, useContextKey;
describe('compiler single-key Context lowering', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    ({act, assertLog, waitFor} = require('internal-test-utils'));
    useContextKey = require('react/compiler-runtime').unstable_useContextKey;
  });
  function store(initial) {
    const Context = React.createContext(initial);
    let set;
    function Provider({children}) {
      const [value, update] = React.useState(initial);
      set = update;
      return <Context.Provider value={value}>{children}</Context.Provider>;
    }
    return {Context, Provider, update: value => set(value)};
  }

  // @gate enableContextSelectors
  it('skips unchanged keys, selects a new key on props changes, and compares with Object.is', async () => {
    const s = store({a: NaN, b: 2});
    const Item = React.memo(function Item({field}) {
      const value = useContextKey(s.Context, field)[field];
      const text = Object.is(value, -0) ? '-0' : String(value);
      Scheduler.log(text);
      return text;
    });
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <s.Provider>
          <Item field="a" />
        </s.Provider>,
      ),
    );
    assertLog(['NaN']);
    await act(() => s.update({a: NaN, b: 3}));
    assertLog([]);
    await act(() =>
      root.render(
        <s.Provider>
          <Item field="b" />
        </s.Provider>,
      ),
    );
    assertLog(['3']);
    await act(() => s.update({a: 1, b: 0}));
    assertLog(['0']);
    await act(() => s.update({a: 1, b: -0}));
    assertLog(['-0']);
    expect(root).toMatchRenderedOutput('-0');
  });

  // @gate enableContextSelectors
  it('avoids interpreting and rereading a key for duplicate propagation checks', async () => {
    const reads = [0, 0];
    const make = i => ({
      get value() {
        reads[i]++;
        return 1;
      },
    });
    const s = store(make(0));
    const Item = React.memo(() =>
      String(useContextKey(s.Context, 'value').value),
    );
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <s.Provider>
          <Item />
        </s.Provider>,
      ),
    );
    expect(reads).toEqual([1, 0]);
    await act(() => s.update(make(1)));
    expect(reads).toEqual([2, 1]);
    expect(root).toMatchRenderedOutput('1');
  });

  // @gate enableContextSelectors
  it('does not eagerly read a throwing property behind a render guard', async () => {
    const bad = {
      get value() {
        throw new Error('not read by the component');
      },
    };
    const s = store(bad);
    const Item = React.memo(function Item({read}) {
      const value = useContextKey(s.Context, 'value');
      return read ? value.value : 'guarded';
    });
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <s.Provider>
          <Item read={false} />
        </s.Provider>,
      ),
    );
    expect(root).toMatchRenderedOutput('guarded');
    await act(() =>
      s.update({
        other: 1,
        get value() {
          throw new Error('still guarded');
        },
      }),
    );
    expect(root).toMatchRenderedOutput('guarded');
    await act(() => s.update({value: 'ok'}));
    await act(() =>
      root.render(
        <s.Provider>
          <Item read={true} />
        </s.Provider>,
      ),
    );
    expect(root).toMatchRenderedOutput('ok');
  });

  // @gate enableContextSelectors
  it('supports nullish contexts and symbol keys', async () => {
    const key = Symbol('key'),
      s = store(null);
    const Item = React.memo(function Item() {
      const value = useContextKey(s.Context, key);
      return value == null ? 'empty' : value[key];
    });
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <s.Provider>
          <Item />
        </s.Provider>,
      ),
    );
    expect(root).toMatchRenderedOutput('empty');
    await act(() => s.update({[key]: 'present'}));
    expect(root).toMatchRenderedOutput('present');
    await act(() => s.update(undefined));
    expect(root).toMatchRenderedOutput('empty');
  });

  // @gate enableContextSelectors
  it('retains the committed snapshot across an interrupted transition', async () => {
    const s = store({a: 0, b: 0});
    function Item({field}) {
      const value = useContextKey(s.Context, field)[field];
      Scheduler.log(field + value);
      return field + value;
    }
    const List = React.memo(() => (
      <>
        <Item field="a" />
        <Item field="b" />
      </>
    ));
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <s.Provider>
          <List />
        </s.Provider>,
      ),
    );
    assertLog(['a0', 'b0']);
    await act(async () => {
      React.startTransition(() => s.update({a: 1, b: 0}));
      await waitFor(['a1']);
      s.update({a: 1, b: 1});
    });
    assertLog(['b1']);
    expect(root).toMatchRenderedOutput('a1b1');
  });
});
