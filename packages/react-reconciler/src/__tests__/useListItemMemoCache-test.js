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

  describe('map with selections', () => {
    const SENTINEL = Symbol.for('react.memo_cache_sentinel');
    const LIST_CHANGES = Symbol.for('react.list_changes');
    let lastResult;
    let invocations = 0;

    function renderItem(item, selected) {
      Scheduler.log('render ' + item.id);
      return item.label + (selected ? '*' : '');
    }

    // Like compiled code for:
    //
    //   function SelectList({items, selectedId}) {
    //     return items.map(item => renderItem(item, item.id === selectedId));
    //   }
    //
    // The callback reads `selectedId` only through `is`, so it does not depend
    // on it and keeps its identity.
    function SelectList({items, selectedId}) {
      const $ = useMemoCache(1);
      const listItemCache = useListItemMemoCache();
      let callback;
      if ($[0] === SENTINEL) {
        callback = item => {
          invocations++;
          const selected = listItemCache.is(0, item.id);
          const $$ = listItemCache.next(3, item.id);
          let t;
          if ($$[0] !== item || $$[1] !== selected) {
            t = renderItem(item, selected);
            $$[0] = item;
            $$[1] = selected;
            $$[2] = t;
          } else {
            t = $$[2];
          }
          return t;
        };
        $[0] = callback;
      } else {
        callback = $[0];
      }
      const result = listItemCache.map(items, callback, [selectedId]);
      lastResult = result;
      return Array.isArray(result) ? result.join(',') : String(result);
    }

    const a = {id: 1, label: 'a'};
    const b = {id: 2, label: 'b'};
    const c = {id: 3, label: 'c'};
    const d = {id: 4, label: 'd'};

    it('calls the callback only for items whose comparisons can change', async () => {
      const items = [a, b, c, d];
      const root = ReactNoop.createRoot();
      invocations = 0;
      await act(() => root.render(<SelectList items={items} selectedId={2} />));
      assertLog(['render 1', 'render 2', 'render 3', 'render 4']);
      expect(root).toMatchRenderedOutput('a,b*,c,d');
      expect(invocations).toBe(4);
      expect(lastResult[LIST_CHANGES]).toBe(undefined);

      // The first time the same array is mapped again, every item is mapped,
      // and from then on their comparisons are recorded.
      invocations = 0;
      await act(() => root.render(<SelectList items={items} selectedId={4} />));
      assertLog(['render 2', 'render 4']);
      expect(root).toMatchRenderedOutput('a,b,c,d*');
      expect(invocations).toBe(4);
      expect(lastResult[LIST_CHANGES]).toBe(undefined);
      const second = lastResult;

      invocations = 0;
      await act(() => root.render(<SelectList items={items} selectedId={1} />));
      assertLog(['render 1', 'render 4']);
      expect(root).toMatchRenderedOutput('a*,b,c,d');
      expect(invocations).toBe(2);
      expect(lastResult).not.toBe(second);
      expect(lastResult[LIST_CHANGES]).toEqual({base: second, indices: [0, 3]});
      expect(lastResult[1]).toBe(second[1]);

      // A selection that no item compares equal to only recomputes the item
      // that was selected.
      const third = lastResult;
      invocations = 0;
      await act(() =>
        root.render(<SelectList items={items} selectedId={99} />),
      );
      assertLog(['render 1']);
      expect(root).toMatchRenderedOutput('a,b,c,d');
      expect(invocations).toBe(1);
      expect(lastResult[LIST_CHANGES]).toEqual({base: third, indices: [0]});

      // Neither the previous nor the new selection matches any item: the
      // previous result is returned as is.
      const fourth = lastResult;
      invocations = 0;
      await act(() =>
        root.render(<SelectList items={items} selectedId={100} />),
      );
      assertLog([]);
      expect(invocations).toBe(0);
      expect(lastResult).toBe(fourth);
      expect(root).toMatchRenderedOutput('a,b,c,d');
    });

    it('calls the callback for every item when the array changes', async () => {
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(<SelectList items={[a, b, c]} selectedId={1} />),
      );
      assertLog(['render 1', 'render 2', 'render 3']);
      // A new array: every item is mapped again (the item caches still
      // prevent recomputing unchanged items).
      await act(() =>
        root.render(<SelectList items={[a, b, c]} selectedId={3} />),
      );
      assertLog(['render 1', 'render 3']);
      expect(root).toMatchRenderedOutput('a,b,c*');
      expect(lastResult[LIST_CHANGES]).toBe(undefined);
    });

    it('matches === for NaN, -0 and values of different types', async () => {
      const zero = {id: 0, label: 'zero'};
      const nan = {id: NaN, label: 'nan'};
      const five = {id: '5', label: 'five'};
      const items = [zero, nan, five];
      const root = ReactNoop.createRoot();
      await act(() => root.render(<SelectList items={items} selectedId={0} />));
      assertLog(['render 0', 'render NaN', 'render 5']);
      expect(root).toMatchRenderedOutput('zero*,nan,five');
      // -0 === 0: nothing changes.
      await act(() =>
        root.render(<SelectList items={items} selectedId={-0} />),
      );
      assertLog([]);
      expect(root).toMatchRenderedOutput('zero*,nan,five');
      // NaN !== NaN: no item is selected. (The item that compared NaN is
      // called again, but its comparison is still false, so its cache hits.)
      await act(() =>
        root.render(<SelectList items={items} selectedId={NaN} />),
      );
      assertLog(['render 0']);
      expect(root).toMatchRenderedOutput('zero,nan,five');
      // 5 !== '5'
      await act(() => root.render(<SelectList items={items} selectedId={5} />));
      assertLog([]);
      expect(root).toMatchRenderedOutput('zero,nan,five');
      await act(() =>
        root.render(<SelectList items={items} selectedId={'5'} />),
      );
      assertLog(['render 5']);
      expect(root).toMatchRenderedOutput('zero,nan,five*');
    });

    it('recomputes every item that compared a changed value', async () => {
      // Like compiled code for items that compare a group and, only when the
      // group matches, a second selection.
      function GroupList({items, group, active}) {
        const $ = useMemoCache(1);
        const listItemCache = useListItemMemoCache();
        let callback;
        if ($[0] === SENTINEL) {
          callback = item => {
            const inGroup = listItemCache.is(0, item.group);
            const isActive = inGroup && listItemCache.is(1, item.id);
            const isAlsoActive = listItemCache.is(1, item.alias);
            listItemCache.next(0, item.id);
            Scheduler.log('render ' + item.id);
            return (
              item.id +
              (inGroup ? 'g' : '') +
              (isActive ? 'a' : '') +
              (isAlsoActive ? 'A' : '')
            );
          };
          $[0] = callback;
        } else {
          callback = $[0];
        }
        return listItemCache.map(items, callback, [group, active]).join(',');
      }
      const items = [
        {id: 1, group: 'x', alias: 10},
        {id: 2, group: 'x', alias: 20},
        {id: 3, group: 'y', alias: 1},
        {id: 4, group: 'y', alias: 40},
      ];
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(<GroupList items={items} group="x" active={1} />),
      );
      assertLog(['render 1', 'render 2', 'render 3', 'render 4']);
      expect(root).toMatchRenderedOutput('1ga,2g,3A,4');
      // Every item of both groups.
      await act(() =>
        root.render(<GroupList items={items} group="y" active={1} />),
      );
      assertLog(['render 1', 'render 2', 'render 3', 'render 4']);
      expect(root).toMatchRenderedOutput('1,2,3gA,4g');
      // Item 1 compared `active` only while it was in the group; item 3
      // compares it through its alias and its id.
      await act(() =>
        root.render(<GroupList items={items} group="y" active={3} />),
      );
      assertLog(['render 3']);
      expect(root).toMatchRenderedOutput('1,2,3ga,4g');
      await act(() =>
        root.render(<GroupList items={items} group="y" active={40} />),
      );
      assertLog(['render 3', 'render 4']);
      expect(root).toMatchRenderedOutput('1,2,3g,4gA');
    });

    it('maps holes and values that are not arrays like Array.prototype.map', async () => {
      const root = ReactNoop.createRoot();
      // eslint-disable-next-line no-sparse-arrays
      const sparse = [a, , c];
      await act(() =>
        root.render(<SelectList items={sparse} selectedId={3} />),
      );
      assertLog(['render 1', 'render 3']);
      expect(lastResult.length).toBe(3);
      expect(1 in lastResult).toBe(false);
      expect(root).toMatchRenderedOutput('a,,c*');
      await act(() =>
        root.render(<SelectList items={sparse} selectedId={1} />),
      );
      assertLog(['render 1', 'render 3']);
      expect(1 in lastResult).toBe(false);
      expect(root).toMatchRenderedOutput('a*,,c');

      const mappable = {
        map(callback) {
          return 'mapped:' + [a, b].map(callback).join('|');
        },
      };
      await act(() =>
        root.render(<SelectList items={mappable} selectedId={2} />),
      );
      assertLog(['render 1', 'render 2']);
      expect(root).toMatchRenderedOutput('mapped:a|b*');

      const replaced = [a, b];
      replaced.map = function (callback) {
        return Array.prototype.map.call(this, callback).reverse();
      };
      await act(() =>
        root.render(<SelectList items={replaced} selectedId={1} />),
      );
      assertLog(['render 1', 'render 2']);
      expect(root).toMatchRenderedOutput('b,a*');
    });

    it('renders correctly when a render that recomputed items does not commit', async () => {
      let resolve;
      const promise = new Promise(r => {
        resolve = r;
      });
      let resolved = false;
      promise.then(() => {
        resolved = true;
      });
      function SuspendingSelectList({items, selectedId}) {
        const $ = useMemoCache(1);
        const listItemCache = useListItemMemoCache();
        let callback;
        if ($[0] === SENTINEL) {
          callback = item => {
            const selected = listItemCache.is(0, item.id);
            const $$ = listItemCache.next(3, item.id);
            if (selected && item.id === 3 && !resolved) {
              Scheduler.log('suspend');
              React.use(promise);
            }
            let t;
            if ($$[0] !== item || $$[1] !== selected) {
              t = renderItem(item, selected);
              $$[0] = item;
              $$[1] = selected;
              $$[2] = t;
            } else {
              t = $$[2];
            }
            return t;
          };
          $[0] = callback;
        } else {
          callback = $[0];
        }
        return listItemCache.map(items, callback, [selectedId]).join(',');
      }
      const items = [a, b, c, d];
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(<SuspendingSelectList items={items} selectedId={1} />),
      );
      assertLog(['render 1', 'render 2', 'render 3', 'render 4']);

      // A transition recomputes item 1, then suspends on item 3.
      React.startTransition(() => {
        root.render(<SuspendingSelectList items={items} selectedId={3} />);
      });
      await waitFor(['render 1', 'suspend']);
      expect(root).toMatchRenderedOutput('a*,b,c,d');

      await act(() =>
        root.render(<SuspendingSelectList items={items} selectedId={2} />),
      );
      // The suspended transition recomputed nothing that this render reads.
      assertLog(['render 1', 'render 2']);
      expect(root).toMatchRenderedOutput('a,b*,c,d');

      await act(async () => {
        resolve();
        await promise;
        root.render(<SuspendingSelectList items={items} selectedId={3} />);
      });
      // How often React retries the transition is not what this test checks.
      Scheduler.unstable_clearLog();
      expect(root).toMatchRenderedOutput('a,b,c*,d');
      await act(() =>
        root.render(<SuspendingSelectList items={items} selectedId={4} />),
      );
      assertLog(['render 3', 'render 4']);
      expect(root).toMatchRenderedOutput('a,b,c,d*');
    });

    it('renders the same in StrictMode', async () => {
      const items = [a, b, c];
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <React.StrictMode>
            <SelectList items={items} selectedId={1} />
          </React.StrictMode>,
        ),
      );
      Scheduler.unstable_clearLog();
      expect(root).toMatchRenderedOutput('a*,b,c');
      await act(() =>
        root.render(
          <React.StrictMode>
            <SelectList items={items} selectedId={3} />
          </React.StrictMode>,
        ),
      );
      Scheduler.unstable_clearLog();
      expect(root).toMatchRenderedOutput('a,b,c*');
    });
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
