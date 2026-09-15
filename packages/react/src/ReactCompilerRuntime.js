/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {useMemoCache} from './ReactHooks';
import {REACT_MEMO_CACHE_SENTINEL} from 'shared/ReactSymbols';
import {enableNoCloningMemoCache} from 'shared/ReactFeatureFlags';

export {useMemoCache as c};

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
class ListItemMemoCache {
  // Item caches and keys of the latest render that invoked the callback.
  previous: Array<Array<mixed>> = [];
  previousKeys: Array<mixed> = [];
  previousByKey: null | Map<mixed, Array<mixed>> = null;
  // Item caches and keys of the current render, once it invokes the callback.
  current: null | Array<Array<mixed>> = null;
  currentKeys: Array<mixed> = [];

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
    let current = this.current;
    if (current === null) {
      current = this.current = [];
    }
    const index = current.length;
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
      const byKey = previousByKey.get(key);
      previous = byKey === undefined ? null : byKey;
    }
    let cache;
    if (previous === null || previous.length !== size) {
      cache = new Array<mixed>(size);
      for (let i = 0; i < size; i++) {
        cache[i] = REACT_MEMO_CACHE_SENTINEL;
      }
    } else if (enableNoCloningMemoCache) {
      cache = previous;
    } else {
      cache = previous.slice();
    }
    current.push(cache);
    this.currentKeys.push(key);
    return cache;
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
