# Experiment 0008: Selector reads

Status: implemented, measured. Rust-only (`compiler/crates`), gated by
`enableSelectorReads` (with `enableContextSelectors`, default `false`). The
runtime is behind `enableSelectorReads` (`__EXPERIMENTAL__`) in React. Builds
on the shared store subscriptions of 0003.

## Goal

With shared store subscriptions (0003), a store has one listener, but every
store change still checks every subscribed `useSyncExternalStore`: it runs the
call's selector on the new state and compares the result. With 5,000
subscribed components and an update that none of them reads, that loop is most
of the cost of the update (see Results). A store update only replaces the
top-level keys it changes, and most selectors read a few static keys, so the
calls that can have a new snapshot are known from the keys that changed.

## Compiler (`react_compiler_optimization/src/context_selectors.rs`)

For a call of a custom hook whose first argument is an inline function (or a
`const` holding one), `selector_reads` follows the function's first parameter
(the state) through loads, `const`/`let` declarations and type casts:

- `state.key` records `key`; what is done with the loaded value does not
  matter, since it is determined by `state.key`;
- object destructuring with static keys records the keys;
- any other use (passing the state on, returning it, a computed key, rest
  destructuring, a read in a nested function, a reassignment, a phi) gives up.

A selector without parameters reads no key. The keys are passed as a fifth
argument to `unstable_selectHookPaths`, as a constant array (memoized once):

```js
const _selectedHook = unstable_startSelectedHook(useBoardStore);
const t4 = useBoardStore(t1);            // t1 = state => state.rows[id]
unstable_selectHookPaths(_selectedHook, t4, useBoardStore, t2, ["rows"]);
```

The call is made through the runtime even if its returned value is not
selected (the paths are `null`), so that every call can be indexed.

`store_hooks.rs` registers hooks defined with Zustand's `create` with their
state getter: `unstable_registerStoreHook(useX, useX.getState)`. Imported
library hooks (`useSelector`, `useStore(api, selector)`) are registered
without one: their store is only known from an argument or from context.

## Runtime

`react/compiler-runtime`:

- `unstable_registerStoreHook(hook, getState?)`: registering a getter promises
  that the hook's snapshot is `selector(getState())`, where `selector` is its
  first argument.
- `unstable_selectHookPaths(started, value, hook, paths, reads?)`: for a store
  hook registered with a getter, passes the keys and the getter to React.

`ReactFiberHooks.js`:

- `selectHookResult` (the verification of 0003: the call read exactly one
  store and returned its snapshot) records the getter for the store's
  `subscribe` function, and commits the keys on the store instance with the
  render, like the comparison of the selection (an uncommitted render leaves
  the committed keys unchanged). Two different getters recorded for one
  `subscribe` function make its state unknown.
- The shared subscription indexes its subscribers by key (and keeps those
  with unknown keys apart), and keeps the state it was last notified with.
  When the store notifies, it reads the new state and, if both states are
  plain objects and not the same object, compares them key by key (keys added
  or removed count as changed). It then only checks the subscribers indexed
  under a changed key and those with unknown keys. Otherwise (no getter, a
  getter that throws, a state that is not a plain object or is the same
  object, the first notification after a getter was recorded) it checks every
  subscriber, as before.
- A subscriber whose committed keys change is indexed again; unsubscribing
  removes it from the index.

### Why skipping is safe

A skipped subscriber's selector reads only keys whose values are identical
(`Object.is`) in the previous and the new state. Selectors are pure, so it
would compute the same snapshot, and the check would find no change. By
induction over notifications, the values it reads are those of the state its
snapshot was computed from: changes before a subscriber subscribes are caught
by `useSyncExternalStore`'s own check after subscribing
(`updateStoreInstance`), and every later change of one of its keys checks it.

This assumes updates replace the values they change. A store whose state is
mutated in place (for example `state.a.n = 1` followed by an update of another
key) would not update a component reading `state.a.n`, where it would before.
Zustand and Redux require immutable updates, but this is a behavior change for
code that breaks the rule. In development, the skipped subscribers are also
checked, and a change is reported with `console.error` (the component is still
not updated, like in production).

## Results

Median ms (p25–p75), local React build. `compiler` is the React Compiler,
`+ selectors` adds 0003 (selectors and shared subscriptions), `+ reads` adds
this experiment.

**5,000 components subscribed to one Zustand store**, updating a key that one
component reads, 200 times (`listeners-5000`):

| compiler | + selectors | + reads |
|---|---|---|
| 32.6 (32.0–33.3) | 29.5 (29.2–30.1) | 13.5 (13.3–13.7) |

**1,000 selectable cards** (`select-*` apps, 12 iterations). The same UI with a
Zustand store read by comparing in render (`id === selectedId` after
`useStore(s => s.selectedId)`), by comparing in the selector
(`useStore(s => s.selectedId === id)`), and with Jotai (an `atomFamily` atom
per card and a derived `isSelected` atom per card):

| workload | app | no compiler | compiler | + selectors | + reads |
|---|---|---|---|---|---|
| select 20 cards | Zustand, compare in render | 41.5 | 32.2 | 13.3 | 12.8 |
| | Zustand, compare in selector | 12.8 | 12.6 | 13.3 | 12.4 |
| | Jotai | 31.6 | 31.0 | 31.0 | 30.8 |
| 500 notifications (no card reads them) | Zustand, compare in render | 44.5 | 44.6 | 37.5 | 16.2 |
| | Zustand, compare in selector | 44.1 | 44.0 | 37.9 | 15.8 |
| | Jotai | 17.6 | 16.8 | 16.0 | 16.2 |
| rename 200 cards | Zustand, compare in render | 42.1 | 41.5 | 40.0 | 38.4 |
| | Zustand, compare in selector | 42.7 | 43.1 | 41.0 | 38.8 |
| | Jotai | 38.5 | 37.0 | 36.6 | 37.2 |

With selectors and reads, a Zustand store matches Jotai's atoms on updates
that few components read (notifications), is within 4% when one card changes
(renames: a changed `cards` key still checks every card), and is faster than
Jotai's derived atoms on selection (Jotai recomputes every card's derived
atom).

**Zustand board** (`board-zustand`, 1,000 cards, 10 iterations), where it is
slower:

| workload | + selectors | + reads |
|---|---|---|
| 50 notifications | 15.9 | 8.3 |
| 50 presence updates | 17.3 | 9.5 |
| select 20 cards | 15.2 | 12.5 |
| star 20 cards | 17.5 | 15.5 |
| toggle theme 10 times (every card renders) | 61.4 (58.7–62.6) | 66.1 (62.9–68.9) |
| rename (30 keystrokes) | 115.2 (113.1–115.8) | 120.6 (118.1–122.5) |
| filter, move, only mine | within noise | |

When every subscriber reads the changed key, nothing is skipped and the
experiment only adds cost: collecting the candidates from the index instead of
looping over the subscriber array, and the runtime calls around store hook
calls whose values were not selected before. Not investigated further.

Timing note: a benchmark step is timed until the next frame, so steps shorter
than a frame are quantized (samples of 5 and 16 ms for the same variant). The
`select-*` workloads run 500 notifications and 200 renames so that a frame is
small against the work.

## Known gaps

- An operand of a comparison that is a property of another hook's value
  (`card.id === selectedId`, where `card` is returned by a store hook) is not
  available at the read (only parameters and values derived from them are), so
  the comparison is not selected: with that form, selecting a card measured
  30.6 (compiler) and 33.3 (+ selectors). Hook return values are frozen, so the
  analysis could accept them.
- Deeper keys: a change of one card replaces `cards`, which checks every card
  reading `cards`. Indexing one level deeper (`cards[id]`) would need the
  keys' dynamic parts and a comparison of the changed object.
- Library hooks without a getter (`useSelector`, `useStore(api, selector)`)
  are always checked.

## Tests

- `packages/react-reconciler/src/__tests__/ReactStoreSelectorReads-test.js`:
  skipping, selections, unknown keys, hooks without a getter, conflicting
  getters, reindexing when the selector changes, uncommitted renders, added
  and removed keys, non-plain state, unmounting, StrictMode, and the
  development warning for in-place mutation.
- Compiler fixtures `experimental/context-selectors/selector-reads-zustand-store`
  and `no-selector-reads-when-state-escapes`.
- `verify.mjs` compares the DOM of every app after every workload step
  (`local/compiler-context-reads`).
