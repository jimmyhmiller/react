# Experiment 0004: Update slicing

Status: first step (skipping store hook calls) implemented; whole-component
slicing not started. Builds on 0003 (context and store
selectors) and idea 3 of `ideas.md`.

## Where full updates spend time

With every experiment on (`local/compiler-all`), toggling the theme of the
board app re-renders all 1,000 cards, because every card renders the theme.
Median ms for 10 toggles:

| app | theme-x10 |
|---|---|
| context | 28.0 |
| Zustand | 52.8 |
| React Redux | 71.7 |

The rendered output and the DOM work are the same in the three apps. A CPU
profile of the Zustand app (200 toggles) shows ~40% of the time in hook
bookkeeping of the store reads rather than in the component or the DOM:

- each card makes 8 store hook calls; each call runs Zustand's `useStore`: two
  `useCallback` calls (allocating two closures and deps arrays), and
  `useSyncExternalStore`, which allocates a bound subscribe function, a deps
  array, a bound `updateStoreInstance`, and two effects with effect instances,
  whether or not its snapshot changed;
- the commit walks each card's 16 passive effects twice, because one of its
  stores changed;
- garbage collection of the above (~10% of samples).

The context app has none of this: a context read allocates one dependency.

## Idea

For a store hook call whose inputs are unchanged, everything the call does in
a new render is determined by the committed render and the store's new
snapshot. The compiler marks such calls, and React skips calling the hook: it
copies the hooks and effects that the call created in the committed render and
applies what `useSyncExternalStore` would do with the new snapshot.

This is the smallest useful slice of a render: the component's own code still
runs (its memo scopes check their inputs and reuse their outputs), but library
hook internals do not.

### Which calls

A call `useX(...args)` in a compiled component or hook can be skipped in a
render when:

1. `useX` is a registered store hook (0003), and in the render being updated
   (the current fiber) the same call (by position among selected calls) was
   verified: it read exactly one store and returned its snapshot;
2. every argument is `Object.is` equal to the argument of that call;
3. no hook created by that call has pending or skipped updates (a store hook
   may use state internally);
4. the render is an update (not a mount, hydration, the second render of
   StrictMode in development, or a re-render for a render phase update);
5. reading the store's new snapshot (`getSnapshot()`) does not throw.

Otherwise the hook is called as usual. Registration asserts that the hook's
returned value only depends on its arguments and the store's snapshot (the
contract already relied on by selections), and 2–3 establish that its hooks
would compute the same values as in the committed render.

### What React does instead of calling the hook

- Hooks: append copies of the call's committed hooks to the work-in-progress
  hook list, advancing the current hook pointer past them, exactly as calling
  the hook with unchanged inputs would (hooks with unchanged deps keep their
  values).
- Effects: push copies of the call's committed effects without `HasEffect`
  (unchanged deps do not re-run), keeping each effect's instance (so destroy
  functions run on unmount), and point copied effect hooks at the copies.
- The store: if the new snapshot differs (`Object.is`), set the
  `useSyncExternalStore` hook's state to it, mark the fiber as having received
  an update, and push `updateStoreInstance` with `HasEffect` and the passive
  flag; push a consistency check in non-blocking renders. This is
  `updateSyncExternalStore` with an unchanged `subscribe` and `getSnapshot`.
- The call's record is carried to the new render.

The returned value is the new snapshot (the hook returns its snapshot).

### Recording a call

`selectHookResult` records each verified store hook call of a render in the
work-in-progress update queue (`storeCalls`, by position among the render's
selected store hook calls): its hooks, effects and context dependencies (the
ranges created between the start and the end of the call), its
`useSyncExternalStore` hook, effect, instance, `subscribe` and `getSnapshot`,
its arguments, whether any of its hooks has an update queue, and in
development the number of hooks it called. A call that used `use`, effect
events or a memo cache is recorded as not skippable (their state is indexed
by call position).

### Compiler (`enableUpdateSlicing`, with `enableContextSelectors`)

A call of a custom hook imported or declared in the module, with at most three
arguments, in a component or hook, selected or not, becomes:

```js
const started = unstable_startSelectedHook(useX);
const skipped = unstable_skipStoreHook1(started, useX, arg0);
const value = skipped !== useX ? skipped : useX(arg0);
unstable_selectHookPaths(started, value, useX, paths); // paths: null if unselected
```

`unstable_skipStoreHookN` returns the hook itself unless React skipped the
call (React never skips a call whose new snapshot is the hook function). The
hook call stays in the compiled code with its original callee and arguments,
so validations of the call (such as known incompatible hooks) and the error of
calling a value that is not a function are unchanged. In the HIR, the skipped
value is an extra argument of the call, which codegen turns into the
conditional (`Environment::sliced_hook_callees`).

## Semantics

Unchanged: the value the component reads, when it renders, its effects and
their order, unmount cleanup, StrictMode double rendering (never skipped),
concurrent consistency checks, Suspense (a throwing snapshot read calls the
hook). Not observable: which internal hooks of a store library were called
(hooks with unchanged inputs are pure).

## Results

Board app, `local/compiler-all` then with `enableUpdateSlicing`, median ms:

| workload | all | all + slicing |
|---|---|---|
| Zustand, theme-x10 (every card renders) | 58.1 | 51.2 |
| React Redux, theme-x10 | 75.4 | 56.6 |
| context, theme-x10 | 28.4 | 29.1 |
| other workloads | within noise | |

For comparison, the React Compiler alone takes 52.5 ms for the Zustand theme
workload: selections cost ~10% when every component renders anyway, and
skipping store hook calls recovers it.

Every one of the 8,003 store hook calls of a Zustand theme toggle is skipped.
A first implementation that mapped effects with temporary arrays made the
skip itself cost as much as the hooks it replaced; walking the (consecutive)
copied effects instead brought the sampled time of 200 toggles from 776 ms to
601 ms. What remains per skipped call is reading the snapshot, copying the
call's hooks and effects, and recording the call.

## Tests

`packages/react-reconciler/src/__tests__/ReactUpdateSlicing-test.js`: skipped
calls (counted), changed arguments, hooks with updates, contexts read by the
hook, effects and cleanup, concurrent consistency, StrictMode, Activity. The
compiler fixture `experimental/context-selectors/slice-store-hook-calls`.

## Plan

1. Done: runtime recording and skip path, tests.
2. Done: compiler emission.
3. Done: measure the board apps; then decide on skipping whole components (update
   slicing proper) for components whose only changed inputs are sources React
   can re-read.
