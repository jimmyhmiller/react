/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment node
 */

let React;
let ReactNoop;
let Scheduler;
let act;
let assertLog;
let useMemoCache;
let useListItemMemoCache;
let waitFor;

// The code in these tests is written the way React Compiler emits it with
// enableListItemMemoization: each call of the `.map` callback memoizes its
// item in the cache returned by `listItemCache.next(size)`.
describe('unstable_useListItemMemoCache()', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    ({act, assertLog, waitFor} = require('internal-test-utils'));
    const runtime = require('react/compiler-runtime');
    useMemoCache = runtime.c;
    useListItemMemoCache = runtime.unstable_useListItemMemoCache;
  });

  function process(item) {
    Scheduler.log('process ' + item);
    return item.toUpperCase();
  }

  // Original code:
  //
  //   function List({items}) {
  //     return items.map(item => process(item)).join(',');
  //   }
  function List({items}) {
    const listItemCache = useListItemMemoCache();
    return items
      .map(item => {
        const $ = listItemCache.next(2);
        let t0;
        if ($[0] !== item) {
          t0 = process(item);
          $[0] = item;
          $[1] = t0;
        } else {
          t0 = $[1];
        }
        return t0;
      })
      .join(',');
  }

  it('reuses the computations of unchanged items by position', async () => {
    const root = ReactNoop.createRoot();
    await act(() => root.render(<List items={['a', 'b', 'c']} />));
    assertLog(['process a', 'process b', 'process c']);
    expect(root).toMatchRenderedOutput('A,B,C');

    await act(() => root.render(<List items={['a', 'x', 'c']} />));
    assertLog(['process x']);
    expect(root).toMatchRenderedOutput('A,X,C');

    // Moved items are recomputed where their position's inputs differ.
    await act(() => root.render(<List items={['c', 'x', 'a']} />));
    assertLog(['process c', 'process a']);
    expect(root).toMatchRenderedOutput('C,X,A');
  });

  it('reuses the caches of moved items by key', async () => {
    // Like compiled code for a keyed list: the key is passed to next().
    function KeyedList({items}) {
      const listItemCache = useListItemMemoCache();
      return items
        .map(item => {
          const $ = listItemCache.next(2, item.id);
          let t0;
          if ($[0] !== item) {
            t0 = process(item.label);
            $[0] = item;
            $[1] = t0;
          } else {
            t0 = $[1];
          }
          return t0;
        })
        .join(',');
    }
    const a = {id: 1, label: 'a'};
    const b = {id: 2, label: 'b'};
    const c = {id: 3, label: 'c'};
    const root = ReactNoop.createRoot();
    await act(() => root.render(<KeyedList items={[a, b, c]} />));
    assertLog(['process a', 'process b', 'process c']);
    // Removing an item shifts the later items; they keep their caches.
    await act(() => root.render(<KeyedList items={[a, c]} />));
    assertLog([]);
    expect(root).toMatchRenderedOutput('A,C');
    await act(() => root.render(<KeyedList items={[c, b, a]} />));
    assertLog(['process b']);
    expect(root).toMatchRenderedOutput('C,B,A');
    // A key whose item changed is recomputed.
    const c2 = {id: 3, label: 'c2'};
    await act(() => root.render(<KeyedList items={[b, c2]} />));
    assertLog(['process c2']);
    expect(root).toMatchRenderedOutput('B,C2');
  });

  it('renders correctly when the list shrinks and grows', async () => {
    const root = ReactNoop.createRoot();
    await act(() => root.render(<List items={['a', 'b', 'c']} />));
    assertLog(['process a', 'process b', 'process c']);
    await act(() => root.render(<List items={['a']} />));
    assertLog([]);
    expect(root).toMatchRenderedOutput('A');
    await act(() => root.render(<List items={['a', 'd', 'c']} />));
    assertLog(['process d']);
    expect(root).toMatchRenderedOutput('A,D,C');
    await act(() => root.render(<List items={[]} />));
    expect(root).toMatchRenderedOutput(null);
    await act(() => root.render(<List items={['e']} />));
    assertLog(['process e']);
    expect(root).toMatchRenderedOutput('E');
  });

  it('keeps separate caches for separate lists and components', async () => {
    function TwoLists({first, second}) {
      const firstCache = useListItemMemoCache();
      const secondCache = useListItemMemoCache();
      const render = (cache, items) =>
        items
          .map(item => {
            const $ = cache.next(2);
            let t0;
            if ($[0] !== item) {
              t0 = process(item);
              $[0] = item;
              $[1] = t0;
            } else {
              t0 = $[1];
            }
            return t0;
          })
          .join(',');
      return render(firstCache, first) + '|' + render(secondCache, second);
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<TwoLists first={['a']} second={['b']} />));
    assertLog(['process a', 'process b']);
    await act(() => root.render(<TwoLists first={['a']} second={['c']} />));
    assertLog(['process c']);
    expect(root).toMatchRenderedOutput('A|C');
  });

  it('keeps the caches when a render does not invoke the callback', async () => {
    // Like compiled code where the `.map` call is memoized on its inputs.
    function MemoizedList({items, label}) {
      const $ = useMemoCache(2);
      const listItemCache = useListItemMemoCache();
      let t0;
      if ($[0] !== items) {
        t0 = items
          .map(item => {
            const $$ = listItemCache.next(2);
            let t1;
            if ($$[0] !== item) {
              t1 = process(item);
              $$[0] = item;
              $$[1] = t1;
            } else {
              t1 = $$[1];
            }
            return t1;
          })
          .join(',');
        $[0] = items;
        $[1] = t0;
      } else {
        t0 = $[1];
      }
      return label + t0;
    }
    const items = ['a', 'b'];
    const root = ReactNoop.createRoot();
    await act(() => root.render(<MemoizedList items={items} label="1:" />));
    assertLog(['process a', 'process b']);
    await act(() => root.render(<MemoizedList items={items} label="2:" />));
    assertLog([]);
    await act(() =>
      root.render(<MemoizedList items={['a', 'b', 'c']} label="3:" />),
    );
    assertLog(['process c']);
    expect(root).toMatchRenderedOutput('3:A,B,C');
  });

  it('recomputes in the second StrictMode render like useMemoCache', async () => {
    function Single({item}) {
      const $ = useMemoCache(2);
      let t0;
      if ($[0] !== item) {
        t0 = process(item);
        $[0] = item;
        $[1] = t0;
      } else {
        t0 = $[1];
      }
      return t0;
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <React.StrictMode>
          <Single item="s" />
        </React.StrictMode>,
      ),
    );
    const singleLog = Scheduler.unstable_clearLog();
    await act(() =>
      root.render(
        <React.StrictMode>
          <List items={['s']} />
        </React.StrictMode>,
      ),
    );
    // The list item is processed exactly as often as the useMemoCache value.
    assertLog(singleLog);
    expect(root).toMatchRenderedOutput('S');
  });

  it('renders correctly after render attempts that did not commit', async () => {
    let resolve;
    const promise = new Promise(r => {
      resolve = r;
    });
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });
    function SuspendingList({items}) {
      const listItemCache = useListItemMemoCache();
      return items
        .map(item => {
          const $ = listItemCache.next(2);
          if (item === 'wait' && !resolved) {
            Scheduler.log('suspend');
            React.use(promise);
          }
          let t0;
          if ($[0] !== item) {
            t0 = process(item);
            $[0] = item;
            $[1] = t0;
          } else {
            t0 = $[1];
          }
          return t0;
        })
        .join(',');
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<SuspendingList items={['a', 'b', 'c']} />));
    assertLog(['process a', 'process b', 'process c']);

    // A transition that writes the first item's cache, then suspends.
    React.startTransition(() => {
      root.render(<SuspendingList items={['x', 'wait', 'c']} />);
    });
    await waitFor(['process x', 'suspend']);
    expect(root).toMatchRenderedOutput('A,B,C');

    // A different update commits first; its inputs differ from the suspended
    // attempt's, so the first item is computed again.
    await act(() => root.render(<SuspendingList items={['a', 'b', 'd']} />));
    assertLog(['process a', 'process d']);
    expect(root).toMatchRenderedOutput('A,B,D');

    await act(async () => {
      resolve();
      await promise;
      root.render(<SuspendingList items={['x', 'wait', 'd']} />);
    });
    assertLog(['process x', 'process wait']);
    expect(root).toMatchRenderedOutput('X,WAIT,D');
  });
});
