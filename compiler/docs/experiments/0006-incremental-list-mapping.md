# Experiment 0006: Incremental list mapping

Status: implemented. Rust-only (`compiler/crates`). Gated by
`enableIncrementalListMapping` (default `false`), which requires
`enableListItemMemoization`. Extends the list item memoization of experiment
0002.

## The problem

Per-item memoization (0002) gives a rendered `.map` callback a memo cache per
item, so an unchanged item returns its previous element. The callback is still
*invoked* for every item of every render: it reads the cache, compares the
item against the recorded inputs and returns the cached output. That is cheap
per item but linear in the list.

A list that grows by appending pays for it quadratically. Adding one row to a
list of n rows invokes the callback n+1 times to produce n cached results and
one new one; adding 2,000 rows one at a time is ~2,000,000 invocations. The
minimal add-rows app spends 204 ms there with everything else enabled
(`local/compiler-inlining-blocks-lists`), against 115 ms with this experiment.

## Idea

If a callback cannot observe the *position* of an item or the array it came
from, then its result for an item depends only on that item and the values the
callback captured. When an immutable update edits the array in one place —
append, prepend, insert, remove, replace — the items before and after the edit
are the same objects as last render, so their results are still valid and can
be copied without invoking the callback.

The mapped results are elements, and reusing one by identity is exactly what
the per-item cache would have produced, so React bails out of the unchanged
items the same way.

## Compiler (`MemoizeListItems`)

A callback already selected for list item memoization (`memoize_list_items.rs`,
which requires an arrow function, a single `return`, a rendered item position
and no context variable access — see 0002) is mapped incrementally when:

1. `enableIncrementalListMapping` is on, and
2. the callback declares **exactly one parameter**
   (`memoize_list_items.rs:170`).

A callback declaring `(item, index)` or `(item, index, array)` can observe an
index that shifts when an item is inserted, or read the new array, so its
result for an unchanged item may legitimately differ. One parameter rules both
out.

Callbacks with *selections* (0002: a captured value used only as an operand of
`===`/`!==`, rewritten to `listItemCache.is(...)`) take the existing
`listItemCache.map(items, callback, [selections])` path instead; the two
mechanisms are exclusive today.

The call becomes `listItemCache.mapIncremental(items, callback, [])`, and the
callback is recorded with `Environment::add_incremental_list_item_callback`.
Codegen then gives it **no per-item memo scope**
(`codegen_reactive_function.rs:2806`): the callback does not call
`listItemCache.next(N)`, because the incremental map is itself its
memoization boundary. That is strictly cheaper than a per-item cache — no
cache array to allocate, copy and check.

```js
// enableListItemMemoization + enableIncrementalListMapping
function List({items}) {
  return <ul>{items.map(item => <li key={item.id}>{item.label}</li>)}</ul>;
}

// =>
function List(t0) {
  const $ = _c(7);
  const _listItemCache = useListItemMemoCache();
  const {items} = t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = item => <li key={item.id}>{item.label}</li>;
    $[0] = t1;
  } else { t1 = $[0]; }
  let t2;
  if ($[1] !== _listItemCache || $[2] !== items || $[3] !== t1) {
    t2 = _listItemCache.mapIncremental(items, t1, []);
    ...
```

The pass runs in client output mode only, and only when the runtime module is
`react/compiler-runtime` (the hook exists there).

## Runtime (`ListItemMemoCache.mapIncremental`)

`packages/react/src/ReactCompilerRuntime.js:557`. Each call, in order:

1. The receiver is not an array, or its `map` is not `Array.prototype.map`:
   call `array.map(callback)` as written and forget the recorded state.
2. Nothing recorded, or the **callback identity** changed, or the number of
   selections changed: map every item (`mapAllItemsIncremental`).
3. Any selection differs: map every item.
4. The array is the **same object** as the recorded one: return the recorded
   result array without invoking the callback at all.
5. Otherwise `mapChangedArray` compares the new array against the recorded one
   from both ends:

```js
while (prefix < sharedLength && previousArray[prefix] === array[prefix]) prefix++;
while (suffix < sharedLength - prefix &&
       previousArray[previousLength - 1 - suffix] === array[length - 1 - suffix]) suffix++;
```

Results for the common prefix and the common suffix are copied from the
recorded result array; the callback is invoked only for
`[prefix, length - suffix)`. Holes are preserved (`i in array` guards each
copy and each call), so a sparse array maps to a sparse result. The record is
then replaced with the new array, result and selections.

For an append, `prefix` is the previous length and `suffix` is 0, so exactly
the new items are mapped.

## Why this is unobservable

- **Index and array.** A one-parameter callback receives neither, so a result
  that was correct at one position is correct at another.
- **The item.** Reuse requires `===` on the item itself. Render being pure,
  the same item produces the same output.
- **Captured values.** A callback that captures a changed value is a new
  closure (its own memo scope in the component invalidates), so
  `mapped.callback !== callback` and everything is mapped again.
- **Selections.** Handled by the other path; a selection change never reaches
  the incremental one.
- **Renders that do not commit.** The record is replaced on every call, and
  every reused result was produced by the callback from an item that is still
  in the array at that position, so a discarded render leaves a record that is
  still consistent with its own inputs.

## Limits

- **One edit region.** Prefix/suffix matching handles a single contiguous
  change. A swap of two distant rows leaves a short prefix and a short suffix,
  so nearly the whole list is mapped again: `rows-swap` is unchanged by this
  flag (blocks, not this, are what made that workload fast).
- **Selections exclude it.** Both the TodoMVC and rows benchmark apps compare a
  captured value in their callbacks (`todo.id === editingId`,
  `selected === item.id`), so they take the selections path. Of the benchmark
  apps only add-rows emits a `mapIncremental` call site, which is why the other
  workloads are flat below.
- **No per-item caches.** These callbacks do not call `next`, so an item that
  *is* mapped recomputes everything it derives.

## Results

Minimal add-rows app, add 2,000 rows one at a time, median ms
(`results/2026-09-16T04-58-14-385Z.json`, 10 iterations, all 13 variants in one
run):

| variant | ms | vs compiler |
|---|---|---|
| no compiler | 1168.6 | 0.41x |
| compiler | 484.5 | 1.00x |
| lists | 337.2 | 1.44x |
| lists + incremental | 247.2 | 1.96x |
| blocks + lists | 324.1 | 1.49x |
| blocks + lists + incremental | 235.6 | 2.06x |
| inlining + blocks + lists | 204.1 | 2.37x |
| **inlining + blocks + lists + incremental** | **115.4** | **4.20x** |

Incremental mapping is worth 1.3–1.8x on top of whatever else is enabled, and
is the single largest contributor to the 4.2x total.

Everywhere else it is within noise, for the reason given under Limits. From
the 48-step run (`results/2026-09-16T03-22-02-274Z.json`), comparing
`local/compiler-inlining-blocks-lists` with `local/compiler-all` (which adds
this flag, plus context selectors that are inert in these apps):

| step | ib-lists | + incremental |
|---|---|---|
| add-1000 | 112.7 | 111.8 |
| rows-append-1k | 25.9 | 24.4 |
| rows-create-10k | 217.0 | 214.5 |
| rows-swap ×10 | 6.6 | 6.9 |
| toggle-200-of-1000 | 25.0 | 25.1 |

## Tests

- `packages/react-reconciler/src/__tests__/useListItemMemoCache-test.js`,
  `describe('incremental map')`: an appended immutable suffix maps only the new
  item; inserting into and removing from the middle maps only the inserted
  item and then nothing at all.
- `packages/babel-plugin-react-compiler-rust/src/__tests__/fixtures/experimental/list-item-memoization/memoize-incremental-list`
  (run with `yarn snap --rust --experimental`).

## Next

1. Combine with selections, so a list that compares a captured value can still
   reuse its unchanged prefix. The comparand recording of
   `map`/`mapChangedItems` already identifies which items a selection change
   can affect; intersecting that with the edited region would cover the common
   TodoMVC shape.
2. Consider matching by key rather than by prefix and suffix, which would cover
   moves and sorts. That costs a map of the previous keys, so it should only
   replace the identity scan when a first pass shows the ends do not match.
