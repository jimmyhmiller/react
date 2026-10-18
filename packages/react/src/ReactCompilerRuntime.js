/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {
  useMemoCache,
  useContextWithSelector,
  startSelectedHook,
  selectHookResult,
  skipStoreHook as skipStoreHookInReact,
} from './ReactHooks';
import {
  REACT_LIST_CHANGES,
  REACT_MEMO_CACHE_SENTINEL,
  REACT_STORE_HOOK_NOT_SKIPPED,
  REACT_STATIC_ISLAND_TYPE,
} from 'shared/ReactSymbols';
import type {ReactContext} from 'shared/ReactTypes';
import {
  enableContextSelectors,
  enableNoCloningMemoCache,
  enableUpdateSlicing,
  enableSelectorReads,
} from 'shared/ReactFeatureFlags';
import isArray from 'shared/isArray';
import getListIdentity from 'shared/ReactListIdentity';
import is from 'shared/objectIs';

export {useMemoCache as c};

// A subtree that needs no hydration (enableStaticIslands): server rendered like
// a visible Activity boundary, and left dehydrated by the client. See
// compiler/docs/experiments/0005-static-islands.md.
export const unstable_StaticIsland: symbol = REACT_STATIC_ISLAND_TYPE;

// Copies a value of a state variable that the component updates in place
// (`todos.push(todo)`), so that the compiler can apply the update to the copy
// and set the state to it. Only values with a well defined copy can be updated
// in place: for anything else (a class instance, a DOM node) the state has to
// be reassigned, and returning the value itself would silently drop the
// update. See compiler/docs/experiments/0007-state-variables.md.
export function unstable_copyForUpdate<T>(value: T): T {
  if (isArray(value)) {
    return (value.slice(): any);
  }
  if (value instanceof Map) {
    return (new Map(value): any);
  }
  if (value instanceof Set) {
    return (new Set(value): any);
  }
  if (typeof value === 'object' && value !== null) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      // Define own properties rather than invoking inherited setters such as
      // Object.prototype.__proto__. Keep the copy writable, even if state was
      // frozen by the development runtime.
      const copy = Object.create(prototype);
      const keys = Reflect.ownKeys(value);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (Object.prototype.propertyIsEnumerable.call(value, key)) {
          Object.defineProperty(copy, key, {
            value: (value: any)[key],
            writable: true,
            enumerable: true,
            configurable: true,
          });
        }
      }
      return (copy: any);
    }
  }
  throw new Error(
    'Cannot update this value of a state variable in place, because it ' +
      'cannot be copied: only arrays, plain objects, Maps and Sets can. ' +
      'Assign a new value to the state variable instead.',
  );
}

// The compiler turns a modification of a state variable into an update of the
// state when it can tell what is modified (`todos[i].done = true`). It cannot
// for a value that is reached dynamically (`todos.find(isDone).done = true`):
// that would modify the state in place, and React would never render it. In
// development, the arrays and plain objects of the state are frozen on every
// render, so that such a modification throws instead of being lost. See
// compiler/docs/experiments/0007-state-variables.md.
export function unstable_freezeState(value: mixed): void {
  if (__DEV__) {
    deepFreeze(value);
  }
}

function deepFreeze(value: mixed): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return;
  }
  if (!isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      // Not the component's to freeze: a class instance, a Map, a DOM node.
      return;
    }
  }
  // Frozen before its properties are visited, which ends cycles.
  Object.freeze(value);
  const keys = Object.keys((value: any));
  for (let i = 0; i < keys.length; i++) {
    deepFreeze((value: any)[keys[i]]);
  }
}

// See enableContextSelectors.
export function unstable_useContextWithSelector<T>(
  Context: ReactContext<T>,
  select: (value: T) => Array<mixed>,
): T {
  if (!enableContextSelectors) {
    throw new Error(
      'Context selectors are not enabled in this build of React.',
    );
  }
  return useContextWithSelector(Context, selectorChanged as any, select);
}

// Whether a selector returns different values (by Object.is) for two values.
function selectorChanged(
  previous: mixed,
  next: mixed,
  select: (value: mixed) => Array<mixed>,
): boolean {
  const previousSelected = select(previous);
  const nextSelected = select(next);
  if (
    !isArray(previousSelected) ||
    !isArray(nextSelected) ||
    previousSelected.length !== nextSelected.length
  ) {
    return true;
  }
  for (let i = 0; i < nextSelected.length; i++) {
    if (!Object.is(previousSelected[i], nextSelected[i])) {
      return true;
    }
  }
  return false;
}

// Selected values described as data, as emitted by the compiler. Each entry
// is an array:
// - `[0, ...keys]`: the value at the path `keys` of the context value;
// - `[1, operand, ...keys]`: whether that value is `=== operand`.
// Reading a key of `null` or `undefined` gives `undefined` instead of
// throwing: a render that reads the same path throws or does not read it.
export type SelectedPaths = $ReadOnlyArray<$ReadOnlyArray<mixed>>;

function readPath(value: mixed, entry: $ReadOnlyArray<mixed>, start: number) {
  let current: any = value;
  for (let i = start; i < entry.length; i++) {
    if (current == null) {
      return undefined;
    }
    current = current[entry[i] as any];
  }
  return current;
}

// Whether a description selects different values from two context values,
// called by React with the description as its argument (so that nothing is
// allocated per description or per comparison).
function pathsChanged(previous: mixed, next: mixed, argument: mixed): boolean {
  const paths: SelectedPaths = argument as any;
  for (let i = 0; i < paths.length; i++) {
    const entry = paths[i];
    if (entry[0] === 0) {
      if (!Object.is(readPath(previous, entry, 1), readPath(next, entry, 1))) {
        return true;
      }
    } else if (
      (readPath(previous, entry, 2) === entry[1]) !==
      (readPath(next, entry, 2) === entry[1])
    ) {
      return true;
    }
  }
  return false;
}

// A compiler-proven single-key selection. Each render owns its cache; no
// subscription, component boundary or application state is introduced.
type ContextKeySelection = {
  key: any,
  initialized: boolean,
  selected: mixed,
  checked: boolean,
  context: mixed,
  result: boolean,
};

function keySelectionChanged(
  previous: mixed,
  next: mixed,
  argument: mixed,
): boolean {
  const selection: ContextKeySelection = argument as any;
  if (!selection.initialized) {
    // Read lazily, at the same stage as the generic path comparator. In
    // particular, do not eagerly evaluate a possibly throwing getter during
    // a render whose control flow does not read that property.
    selection.selected =
      previous == null ? undefined : (previous: any)[selection.key];
    selection.initialized = true;
  }
  if (selection.checked && Object.is(selection.context, next)) {
    return selection.result;
  }
  const value = next == null ? undefined : (next: any)[selection.key];
  const result = !Object.is(selection.selected, value);
  // Do not cache exceptions. The reconciler treats them as changed and the
  // normal component render remains responsible for throwing, if it does.
  selection.context = next;
  selection.result = result;
  selection.checked = true;
  return result;
}

export function unstable_useContextKey<T>(
  Context: ReactContext<T>,
  key: mixed,
): T {
  if (!enableContextSelectors) {
    throw new Error(
      'Context selectors are not enabled in this build of React.',
    );
  }
  const selection: ContextKeySelection = {
    key,
    initialized: false,
    selected: undefined,
    checked: false,
    context: undefined,
    result: false,
  };
  return useContextWithSelector(Context, keySelectionChanged as any, selection);
}

export function unstable_useContextPaths<T>(
  Context: ReactContext<T>,
  paths: SelectedPaths,
): T {
  if (!enableContextSelectors) {
    throw new Error(
      'Context selectors are not enabled in this build of React.',
    );
  }
  return useContextWithSelector(Context, pathsChanged as any, paths);
}

// Registered hooks whose returned value can be selected, by kind:
// - 1: custom hooks that the compiler verified to return the value of the one
//   context they read (or throw), for every value of the context.
// - 2: hooks of external store libraries that return the snapshot of the one
//   useSyncExternalStore they call, for every snapshot (like the hooks
//   returned by Zustand's `create`, or React Redux's `useSelector`),
//   registered by compiled modules that define or import them.
const selectedHooks: WeakMap<Function, 1 | 2> = new WeakMap();

export function unstable_registerContextHook(hook: Function): void {
  if (enableContextSelectors) {
    selectedHooks.set(hook, 1);
  }
}

// The state getters of registered store hooks (enableSelectorReads). A store
// hook registered with a getter promises that its snapshot is
// `selector(getState())`, where `selector` is its first argument, so that
// React can compare the keys of the state the selector reads (see
// unstable_selectHookPaths).
const storeStateGetters: WeakMap<Function, () => mixed> = new WeakMap();

export function unstable_registerStoreHook(
  hook: Function,
  getState?: () => mixed,
): void {
  if (enableContextSelectors) {
    selectedHooks.set(hook, 2);
    if (enableSelectorReads && typeof getState === 'function') {
      storeStateGetters.set(hook, getState);
    }
  }
}

// `const started = unstable_startSelectedHook(useX); const value = useX(...);
// unstable_selectHookPaths(started, value, useX, paths)` behaves like
// `const value = useX(...)`, but:
// - if `useX` is a registered context hook, the component only renders for a
//   change of that context if the selected values change (see
//   unstable_useContextPaths). React checks that the call read exactly one
//   context, called no other hook and returned the context value.
// - if `useX` is a registered store hook, the component only renders for a
//   change of the store if the selected values of the snapshot change. React
//   checks that the call read exactly one store and returned its snapshot.
export function unstable_startSelectedHook(hook: Function): 0 | 1 | 2 {
  if (!enableContextSelectors) {
    throw new Error(
      'Context selectors are not enabled in this build of React.',
    );
  }
  const kind = selectedHooks.get(hook);
  if (kind === undefined) {
    return 0;
  }
  startSelectedHook(kind);
  return kind;
}

//
// `reads` (enableSelectorReads) lists the top-level keys of the store's state
// that the selector passed as the hook's first argument reads, if the compiler
// could describe them. For a store hook registered with a state getter, React
// then only checks the call's snapshot when one of those keys changed.
export function unstable_selectHookPaths<T>(
  started: 0 | 1 | 2,
  value: T,
  hook: Function,
  paths: SelectedPaths | null,
  reads?: $ReadOnlyArray<mixed> | null,
): T {
  if (started === 0) {
    return value;
  }
  let getState = null;
  if (enableSelectorReads && started === 2 && reads != null) {
    getState = storeStateGetters.get(hook) ?? null;
  }
  return selectHookResult(
    value,
    paths === null ? null : (pathsChanged as any),
    paths,
    getState === null ? null : (reads as any),
    getState,
  );
}

// Update slicing (enableUpdateSlicing): after
// `const started = unstable_startSelectedHook(useX)`, the compiler emits
// `const skipped = unstable_skipStoreHookN(started, useX, ...args)` and
// `skipped !== useX ? skipped : useX(...args)` (with N arguments). For a
// registered store hook whose call in the previous render had the same
// arguments, React can skip the call and return the store's new snapshot
// (see skipStoreHook in ReactFiberHooks); otherwise this returns the hook,
// and the hook is called. React never skips a call whose snapshot is the hook.
function skipStoreHook(
  started: 0 | 1 | 2,
  hook: Function,
  argumentCount: number,
  argument0: mixed,
  argument1: mixed,
  argument2: mixed,
): mixed {
  if (!enableUpdateSlicing) {
    throw new Error('Update slicing is not enabled in this build of React.');
  }
  if (started !== 2) {
    return hook;
  }
  const value = skipStoreHookInReact(
    hook,
    argumentCount,
    argument0,
    argument1,
    argument2,
  );
  return value === REACT_STORE_HOOK_NOT_SKIPPED ? hook : value;
}

export function unstable_skipStoreHook0(
  started: 0 | 1 | 2,
  hook: Function,
): mixed {
  return skipStoreHook(started, hook, 0, undefined, undefined, undefined);
}

export function unstable_skipStoreHook1(
  started: 0 | 1 | 2,
  hook: Function,
  argument0: mixed,
): mixed {
  return skipStoreHook(started, hook, 1, argument0, undefined, undefined);
}

export function unstable_skipStoreHook2(
  started: 0 | 1 | 2,
  hook: Function,
  argument0: mixed,
  argument1: mixed,
): mixed {
  return skipStoreHook(started, hook, 2, argument0, argument1, undefined);
}

export function unstable_skipStoreHook3(
  started: 0 | 1 | 2,
  hook: Function,
  argument0: mixed,
  argument1: mixed,
  argument2: mixed,
): mixed {
  return skipStoreHook(started, hook, 3, argument0, argument1, argument2);
}

export function unstable_selectHookResult<T>(
  started: 0 | 1 | 2,
  value: T,
  hook: Function,
  select: (value: T) => Array<mixed>,
): T {
  return started !== 0
    ? selectHookResult(value, selectorChanged as any, select, null, null)
    : value;
}

// Memo caches for the items of a list rendered by a `.map` callback, used by
// React Compiler output that memoizes each item of a list separately.
//
// A component calls `unstable_useListItemMemoCache()` once per render, at its
// top level, for each such list. Each invocation of the callback during that
// render calls `next(size, key)` and uses the returned array exactly like the
// array returned by `useMemoCache(size)`: the compiler writes each memoized
// output together with its inputs, so any cache can be reused for any item.
//
// The n-th call of a render reuses the cache of the n-th call of the previous
// render that made calls, unless that call had a different key, in which case
// it reuses the cache of the previous call with the same key (so that items
// that moved keep their caches). Caches follow the same rules as
// `useMemoCache`:
// - The list cache is stored in the component's memo cache, so it is fresh
//   whenever the memo cache is (on mount, and for the second render of a
//   component in StrictMode in development).
// - Unless enableNoCloningMemoCache is on, each item cache is copied before it
//   is written in a render, so a render that does not commit never modifies a
//   cache that another render reads. Like with enableNoCloningMemoCache, a
//   later render may start from the caches filled by a render that did not
//   commit; this is safe because every output is written with its inputs.
//
// Selections. When the callback reads a value of the component only to
// compare it with `===` or `!==` (such as `item.id === selectedId`), the
// compiler calls `map(array, callback, selections)` instead of
// `array.map(callback)`, and replaces each comparison with
// `matchesSelection(selectionIndex, comparand)`, which returns exactly
// `selections[selectionIndex] === comparand`, and records the comparand for the
// item being computed.
//
// When `map` is called with the same array and the same callback as the
// previous time, only the selections can have changed. An item's result can
// then only differ if one of its comparisons can: if the item compared a
// changed selection with a value equal to the selection's previous or new
// value. Every other item would evaluate the same comparisons with the same
// results, so (render being pure) it would return the same element. `map`
// calls the callback only for the items that can differ, and returns a copy of
// the previous result with those items replaced. The copy records the previous
// result identity and the replaced indices (REACT_LIST_CHANGES), letting a
// renderer that committed the previous result update only those items.
//
// The callback's identity stands for everything else it reads: the compiler
// memoizes it on those values, and only the selections are read through `matchesSelection`.
//
// Recording comparands costs a little for every item, and is only useful if
// the same array is mapped again. `map` records them when it maps the same
// array as the previous time (so the first change of a selection after the
// array changed maps every item, and later ones only the changed items).

// $FlowFixMe[method-unbinding]
const ArrayPrototypeMap = Array.prototype.map;

// The comparand of an item that did not compare a selection.
const NOT_COMPARED: {...} = {};

// The comparands of an item that compared a selection more than once.
class MultipleComparands {
  values: Array<mixed>;
  constructor(values: Array<mixed>) {
    this.values = values;
  }
}

export type ListChanges = {
  base: symbol,
  // Ascending indices of the items that differ from the base list.
  indices: $ReadOnlyArray<number>,
};

type MappedList = {
  array: $ReadOnlyArray<mixed>,
  callback: (item: mixed, index: number, array: $ReadOnlyArray<mixed>) => mixed,
  selections: $ReadOnlyArray<mixed>,
  result: Array<mixed>,
  // comparands[selection][item]: NOT_COMPARED, a comparand, or
  // MultipleComparands. Null if they were not recorded.
  comparands: null | Array<Array<mixed>>,
  // For each selection, the items by comparand. Built when first needed.
  itemsByComparand: Array<null | Map<mixed, Array<number>>>,
};

function addComparand(
  itemsByComparand: Map<mixed, Array<number>>,
  comparand: mixed,
  item: number,
): void {
  if (comparand === NOT_COMPARED) {
    return;
  }
  if (comparand instanceof MultipleComparands) {
    const values = comparand.values;
    for (let i = 0; i < values.length; i++) {
      addComparand(itemsByComparand, values[i], item);
    }
    return;
  }
  const items = itemsByComparand.get(comparand);
  if (items === undefined) {
    itemsByComparand.set(comparand, [item]);
  } else if (items[items.length - 1] !== item) {
    items.push(item);
  }
}

function removeComparand(
  itemsByComparand: Map<mixed, Array<number>>,
  comparand: mixed,
  item: number,
): void {
  if (comparand === NOT_COMPARED) {
    return;
  }
  if (comparand instanceof MultipleComparands) {
    const values = comparand.values;
    for (let i = 0; i < values.length; i++) {
      removeComparand(itemsByComparand, values[i], item);
    }
    return;
  }
  const items = itemsByComparand.get(comparand);
  if (items === undefined) {
    return;
  }
  const index = items.indexOf(item);
  if (index !== -1) {
    items.splice(index, 1);
    if (items.length === 0) {
      itemsByComparand.delete(comparand);
    }
  }
}

class ListItemMemoCache {
  // Item caches and keys of the latest render that invoked the callback, by
  // call (or, for `map`, by item index).
  previous: Array<void | Array<mixed>> = [];
  previousKeys: Array<mixed> = [];
  previousByKey: null | Map<mixed, void | Array<mixed>> = null;
  // Item caches and keys of the current render, once it invokes the callback
  // outside of `map`.
  current: null | Array<void | Array<mixed>> = null;
  currentKeys: Array<mixed> = [];

  // The current selection values (see `map`).
  selections: $ReadOnlyArray<mixed> = [];
  // While `map` invokes the callback for an item: the item's index (-1
  // otherwise), and where the invocation's cache, key and comparands are
  // written (at `writeIndex`).
  cursor: number = -1;
  writeIndex: number = 0;
  writeCaches: Array<void | Array<mixed>> = [];
  writeKeys: Array<mixed> = [];
  // writeComparands[selection][writeIndex], or null if comparands are not
  // recorded.
  writeComparands: null | Array<Array<mixed>> = null;
  // The latest completed `map`.
  mapped: null | MappedList = null;

  startRender(): void {
    const current = this.current;
    if (current !== null) {
      // A render that did not finish (it threw or suspended) invoked the
      // callback fewer times; keep the older caches for the remaining items.
      const previous = this.previous;
      const currentKeys = this.currentKeys;
      for (let i = current.length; i < previous.length; i++) {
        current.push(previous[i]);
        currentKeys.push(this.previousKeys[i]);
      }
      this.previous = current;
      this.previousKeys = currentKeys;
      this.previousByKey = null;
      this.current = null;
      this.currentKeys = [];
    }
  }

  next(size: number, key?: mixed): Array<mixed> {
    const cursor = this.cursor;
    let current = this.current;
    let index = cursor;
    if (cursor === -1) {
      if (current === null) {
        current = this.current = [];
      }
      index = current.length;
    }
    const previousList = this.previous;
    let previous = index < previousList.length ? previousList[index] : null;
    if (key !== undefined && this.previousKeys[index] !== key) {
      let previousByKey = this.previousByKey;
      if (previousByKey === null) {
        previousByKey = this.previousByKey = new Map();
        const previousKeys = this.previousKeys;
        for (let i = 0; i < previousList.length; i++) {
          if (
            previousKeys[i] !== undefined &&
            !previousByKey.has(previousKeys[i])
          ) {
            previousByKey.set(previousKeys[i], previousList[i]);
          }
        }
      }
      previous = previousByKey.get(key);
    }
    let cache;
    if (previous == null || previous.length !== size) {
      cache = new Array<mixed>(size);
      for (let i = 0; i < size; i++) {
        cache[i] = REACT_MEMO_CACHE_SENTINEL;
      }
    } else if (enableNoCloningMemoCache) {
      cache = previous;
    } else {
      cache = previous.slice();
    }
    if (cursor === -1) {
      (current as any).push(cache);
      this.currentKeys.push(key);
    } else {
      this.writeCaches[this.writeIndex] = cache;
      this.writeKeys[this.writeIndex] = key;
    }
    return cache;
  }

  // `selections[selection] === comparand`, recording the comparand for the
  // item that `map` is computing.
  matchesSelection(selection: number, comparand: mixed): boolean {
    const writeComparands = this.writeComparands;
    if (writeComparands !== null) {
      const comparands = writeComparands[selection];
      const index = this.writeIndex;
      const existing = comparands[index];
      if (existing === NOT_COMPARED) {
        comparands[index] = comparand;
      } else if (existing instanceof MultipleComparands) {
        existing.values.push(comparand);
      } else {
        comparands[index] = new MultipleComparands([existing, comparand]);
      }
    }
    return this.selections[selection] === comparand;
  }

  // `array.map(callback)`, where the callback reads `selections` through
  // `matchesSelection`.
  map(
    array: $ReadOnlyArray<mixed>,
    callback: (
      item: mixed,
      index: number,
      array: $ReadOnlyArray<mixed>,
    ) => mixed,
    selections: $ReadOnlyArray<mixed>,
  ): mixed {
    this.selections = selections;
    if (!isArray(array) || array.map !== ArrayPrototypeMap) {
      // Only arrays are mapped item by item. Anything else with a `map`
      // method (or an array whose `map` was replaced) is called as written.
      this.mapped = null;
      return (array as any).map(callback);
    }
    const mapped = this.mapped;
    if (mapped === null || mapped.array !== array) {
      return this.mapAllItems(array, callback, selections, false);
    }
    if (
      mapped.callback === callback &&
      mapped.selections.length === selections.length
    ) {
      let changed = false;
      for (let i = 0; i < selections.length; i++) {
        if (selections[i] !== mapped.selections[i]) {
          changed = true;
          break;
        }
      }
      if (!changed) {
        // Every item would be computed with the same inputs.
        return mapped.result;
      }
      if (mapped.comparands !== null) {
        return this.mapChangedItems(mapped, mapped.comparands, selections);
      }
    }
    return this.mapAllItems(array, callback, selections, true);
  }

  // Like `map`, but compiler-only callers promise that the callback cannot
  // observe the item index or source array. When an immutable update preserves
  // item identities at the start and/or end of the array, reuse those results
  // without invoking the callback. These callbacks do not call `next`: the
  // incremental map is itself their memoization boundary.
  mapIncremental(
    array: $ReadOnlyArray<mixed>,
    callback: (
      item: mixed,
      index: number,
      array: $ReadOnlyArray<mixed>,
    ) => mixed,
    selections: $ReadOnlyArray<mixed>,
  ): mixed {
    this.selections = selections;
    if (!isArray(array) || array.map !== ArrayPrototypeMap) {
      this.mapped = null;
      return (array as any).map(callback);
    }
    const mapped = this.mapped;
    if (
      mapped === null ||
      mapped.callback !== callback ||
      mapped.selections.length !== selections.length
    ) {
      return this.mapAllItemsIncremental(array, callback, selections);
    }
    for (let i = 0; i < selections.length; i++) {
      if (mapped.selections[i] !== selections[i]) {
        return this.mapAllItemsIncremental(array, callback, selections);
      }
    }
    if (mapped.array === array) {
      return mapped.result;
    }
    return this.mapChangedArray(mapped, array, callback, selections);
  }

  mapAllItemsIncremental(
    array: $ReadOnlyArray<mixed>,
    callback: (
      item: mixed,
      index: number,
      array: $ReadOnlyArray<mixed>,
    ) => mixed,
    selections: $ReadOnlyArray<mixed>,
  ): Array<mixed> {
    const result = ArrayPrototypeMap.call(array, callback);
    this.previous = [];
    this.previousKeys = [];
    this.previousByKey = null;
    this.mapped = {
      array,
      callback,
      selections,
      result,
      comparands: null,
      itemsByComparand: new Array<null | Map<mixed, Array<number>>>(
        selections.length,
      ).fill(null),
    };
    return result;
  }

  mapChangedArray(
    mapped: MappedList,
    array: $ReadOnlyArray<mixed>,
    callback: (
      item: mixed,
      index: number,
      array: $ReadOnlyArray<mixed>,
    ) => mixed,
    selections: $ReadOnlyArray<mixed>,
  ): Array<mixed> {
    const previousArray = mapped.array;
    const previousLength = previousArray.length;
    const length = array.length;
    const sharedLength = Math.min(previousLength, length);
    let prefix = 0;
    while (
      prefix < sharedLength &&
      prefix in previousArray === prefix in array &&
      is(previousArray[prefix], array[prefix])
    ) {
      prefix++;
    }
    let suffix = 0;
    while (
      suffix < sharedLength - prefix &&
      previousLength - 1 - suffix in previousArray ===
        length - 1 - suffix in array &&
      is(previousArray[previousLength - 1 - suffix], array[length - 1 - suffix])
    ) {
      suffix++;
    }

    const result = new Array<mixed>(length);
    for (let i = 0; i < prefix; i++) {
      if (i in mapped.result) {
        result[i] = mapped.result[i];
      }
    }
    for (let i = 0; i < suffix; i++) {
      const previousIndex = previousLength - suffix + i;
      const index = length - suffix + i;
      if (previousIndex in mapped.result) {
        result[index] = mapped.result[previousIndex];
      }
    }

    for (let i = prefix; i < length - suffix; i++) {
      if (i in array) {
        result[i] = callback(array[i], i, array);
      }
    }
    this.previous = [];
    this.previousKeys = [];
    this.previousByKey = null;
    this.mapped = {
      array,
      callback,
      selections,
      result,
      comparands: null,
      itemsByComparand: new Array<null | Map<mixed, Array<number>>>(
        selections.length,
      ).fill(null),
    };
    return result;
  }

  // Makes `next` and `matchesSelection` write to the given arrays, and returns the arrays
  // for the comparands.
  startWriting(
    caches: Array<void | Array<mixed>>,
    keys: Array<mixed>,
    selectionCount: number,
    length: number,
    record: boolean,
  ): null | Array<Array<mixed>> {
    let comparands: null | Array<Array<mixed>> = null;
    if (record) {
      comparands = [];
      for (let i = 0; i < selectionCount; i++) {
        comparands.push(new Array<mixed>(length).fill(NOT_COMPARED));
      }
    }
    this.writeCaches = caches;
    this.writeKeys = keys;
    this.writeComparands = comparands;
    return comparands;
  }

  stopWriting(): void {
    this.cursor = -1;
    this.writeIndex = 0;
    this.writeCaches = [];
    this.writeKeys = [];
    this.writeComparands = null;
  }

  mapAllItems(
    array: $ReadOnlyArray<mixed>,
    callback: (
      item: mixed,
      index: number,
      array: $ReadOnlyArray<mixed>,
    ) => mixed,
    selections: $ReadOnlyArray<mixed>,
    record: boolean,
  ): Array<mixed> {
    const length = array.length;
    const result = new Array<mixed>(length);
    const caches = new Array<void | Array<mixed>>(length);
    const keys = new Array<mixed>(length);
    const comparands = this.startWriting(
      caches,
      keys,
      selections.length,
      length,
      record,
    );
    try {
      for (let i = 0; i < length; i++) {
        // Like Array.prototype.map, skip the holes of a sparse array.
        if (i in array) {
          this.cursor = i;
          this.writeIndex = i;
          result[i] = callback(array[i], i, array);
        }
      }
    } finally {
      this.stopWriting();
    }
    this.previous = caches;
    this.previousKeys = keys;
    this.previousByKey = null;
    getListIdentity(result);
    this.mapped = {
      array,
      callback,
      selections,
      result,
      comparands,
      itemsByComparand: new Array<null | Map<mixed, Array<number>>>(
        selections.length,
      ).fill(null),
    };
    return result;
  }

  mapChangedItems(
    mapped: MappedList,
    comparands: Array<Array<mixed>>,
    selections: $ReadOnlyArray<mixed>,
  ): Array<mixed> {
    let changed: null | Set<number> = null;
    for (let i = 0; i < selections.length; i++) {
      const previousSelection = mapped.selections[i];
      const selection = selections[i];
      if (previousSelection === selection) {
        continue;
      }
      let itemsByComparand = mapped.itemsByComparand[i];
      if (itemsByComparand === null) {
        itemsByComparand = mapped.itemsByComparand[i] = new Map();
        const selectionComparands = comparands[i];
        for (let j = 0; j < selectionComparands.length; j++) {
          addComparand(itemsByComparand, selectionComparands[j], j);
        }
      }
      // Map keys are compared with SameValueZero, which only differs from
      // `===` for NaN: items that compared NaN are recomputed needlessly.
      const previousItems = itemsByComparand.get(previousSelection);
      const items = itemsByComparand.get(selection);
      if (previousItems !== undefined || items !== undefined) {
        if (changed === null) {
          changed = new Set();
        }
        if (previousItems !== undefined) {
          for (let j = 0; j < previousItems.length; j++) {
            changed.add(previousItems[j]);
          }
        }
        if (items !== undefined) {
          for (let j = 0; j < items.length; j++) {
            changed.add(items[j]);
          }
        }
      }
    }
    if (changed === null) {
      // No item compared a changed selection with its previous or new value,
      // so every item is the same.
      mapped.selections = selections;
      return mapped.result;
    }
    const indices = Array.from(changed).sort((a, b) => a - b);
    const array = mapped.array;
    const callback = mapped.callback;
    const values = new Array<mixed>(indices.length);
    const caches = new Array<void | Array<mixed>>(indices.length);
    const keys = new Array<mixed>(indices.length);
    const itemComparands: Array<Array<mixed>> = this.startWriting(
      caches,
      keys,
      selections.length,
      indices.length,
      true,
    ) as any;
    try {
      for (let i = 0; i < indices.length; i++) {
        const index = indices[i];
        this.cursor = index;
        this.writeIndex = i;
        values[i] = callback(array[index], index, array);
      }
    } finally {
      this.stopWriting();
    }
    // Every invocation completed; apply their results.
    const result = mapped.result.slice();
    getListIdentity(result);
    for (let i = 0; i < indices.length; i++) {
      const index = indices[i];
      result[index] = values[i];
      this.previous[index] = caches[i];
      this.previousKeys[index] = keys[i];
      for (let j = 0; j < selections.length; j++) {
        const itemsByComparand = mapped.itemsByComparand[j];
        const comparand = itemComparands[j][i];
        if (itemsByComparand !== null) {
          removeComparand(itemsByComparand, comparands[j][index], index);
          addComparand(itemsByComparand, comparand, index);
        }
        comparands[j][index] = comparand;
      }
    }
    this.previousByKey = null;
    const changes: ListChanges = {
      base: getListIdentity(mapped.result),
      indices,
    };
    (result as any)[REACT_LIST_CHANGES] = changes;
    mapped.result = result;
    mapped.selections = selections;
    return result;
  }
}

export function unstable_useListItemMemoCache(): ListItemMemoCache {
  const $ = useMemoCache(1);
  let listCache: ListItemMemoCache = $[0] as any;
  if ((listCache as mixed) === REACT_MEMO_CACHE_SENTINEL) {
    listCache = new ListItemMemoCache();
    $[0] = listCache;
  }
  listCache.startRender();
  return listCache;
}
