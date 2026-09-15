# Experiment 0003: Context Selectors

Status: in progress. The compiler side is Rust-only (`compiler/crates`), gated
by `enableContextSelectors` (default `false`, client output, the
react/compiler-runtime module). The runtime is behind `enableContextSelectors`
(`__EXPERIMENTAL__`) in React.

## Goal

When a context value changes, React renders every component that read the
context, even if the component only uses values of the context that did not
change. With the React Compiler, such a render is cheap per component (every
memo scope hits), but it still costs a function call, hook reads and fiber
work for each consumer. In apps with many consumers of a context that changes
often, this dominates: in the board benchmark app (1,000 cards reading a board,
session and theme context), a notification counter in the session context
re-rendered all 1,016 components on every notification.

This experiment makes the compiler describe which values of each context a
component depends on, and makes React skip rendering the component when those
values are unchanged.

## Prior art in this repository

The compiler had a `lowerContextAccess` pass (August 2024, "only for internal
profiling") that rewrote `const {foo, bar} = useContext(Ctx)` into
`useContext_withSelector(Ctx, ctx => [ctx.foo, ctx.bar])`, backed by
`unstable_useContextWithBailout` in the reconciler. It only handled immediately
destructured reads. The runtime API was removed in December 2024 ("the
experiment turned out to be inconclusive. Since most of our performance
critical usage is already optimized, we weren't able to find a clear win") and
the compiler flag in February 2026 ("not a sufficient/consistent win given the
benefit the compiler already provides").

That conclusion matches what the compiler's memoization implies: a skipped
render is only valuable when many consumers read a context that changes for
reasons unrelated to most of them. This experiment differs in what it can
select (computed keys, comparisons, reads in closures, custom hooks across
modules) and is measured on apps with that shape.

## Runtime (React)

`packages/react-reconciler/src/ReactFiberNewContext.js`:

- A context dependency can carry `changed(previous, next, argument)` and
  `changedArgument`. When a provider's value changes, context propagation
  (`propagateContextChanges`) and the bailout check
  (`checkIfContextChanged`) call `changed(memoizedValue, newValue, argument)`
  for such a dependency, and only schedule the consumer if it returns true. A
  comparison that throws counts as a change.
- `readContextWithSelector(context, changed, argument)` records such a
  dependency. It is exposed to compiled code through the dispatcher
  (`unstable_useContextWithSelector`); Fizz reads the context normally (a server
  render does not re-render), Flight does not support context, and
  DevTools' hook inspection reports a `Context` hook.
- The comparison is called with the value the consumer read, not a cached
  selection, so nothing is computed during render.

`packages/react/src/ReactCompilerRuntime.js`:

- `unstable_useContextPaths(Context, paths)`: the description emitted by the
  compiler. Each entry is `[0, ...keys]` (the value at a path) or
  `[1, operand, ...keys]` (whether that value is `=== operand`). Reading a key
  of `null` or `undefined` gives `undefined`. The comparison reads each path
  from both values; nothing is allocated per comparison.
- `unstable_useContextWithSelector(Context, select)`: the same with a selector
  function returning an array (compared with `Object.is`).
- Custom hooks: `unstable_registerContextHook(useX)`,
  `unstable_startSelectedHook(useX)` and `unstable_selectHookPaths(started,
  value, useX, paths)` (see below).

Nested providers: like `useContext`, propagation schedules consumers below a
nested provider of the same context, and their comparisons are called with
the outer value. They may render needlessly, never too little: a change of the
nested provider's value is propagated by the nested provider.

## Compiler (`react_compiler_optimization/src/context_selectors.rs`)

Runs after `InferTypes`, before `AnalyseFunctions` (so the rewritten code's
effects are inferred like any other code), in components and hooks.

For each `useContext(Ctx)` call, and each call of a custom hook imported or
declared in the module, in a statement block:

1. Follow the returned value through `LoadLocal`, `const` stores, type casts,
   object destructuring (static and available computed keys) and property
   loads, in the function and in functions it creates (event handlers keep the
   value of the render that created them, so what they read must not change
   without a render). Before `AnalyseFunctions` a nested function's context can
   list values its body does not read, so reads are found in bodies.
2. A value at a path that is only compared with `===`/`!==` against an operand
   that has the same value at the read selects the comparison. Available
   operands (and computed keys) are values computed before the read in an
   unconditional block, parameters, or property loads of values rooted in the
   parameters (props are frozen), which are evaluated again before the read.
3. Any other use of a value (call argument, JSX attribute, return, method call
   receiver, phi, terminal) selects the whole value at its path. A use of the
   context value itself leaves the read unchanged.
4. Entries under a selected path are dropped (context values are not
   mutated).

The description is built from array literals right before the read (so the
compiler memoizes it on the operands) and passed to `unstable_useContextPaths`.

### Custom hooks

`const board = useBoard()`, where `useBoard` wraps `useContext`, is the common
way apps read context, often from another module. A call's value can only be
selected if the hook returns the context value it reads for every value of the
context; otherwise (e.g. `return ctx.enabled ? ctx : FALLBACK`) the selected
paths of the returned value say nothing about when the hook's result changes.

- When compiling a module, a hook whose only hook call is one `useContext` and
  whose every `return` returns that call's value (other exits throw) is
  registered: `unstable_registerContextHook(useBoard)` follows its declaration.
- A call site is rewritten to
  `const started = unstable_startSelectedHook(useBoard); const board = useBoard();
  unstable_selectHookPaths(started, board, useBoard, paths)`. Both runtime calls
  are typed as hooks, so they are never memoized and run at their position.
- React applies the description only if the hook is registered and, since the
  start, the component read exactly one context, created no other hook, and
  the hook returned that context's value. Unregistered hooks cost a `WeakSet`
  lookup.

### Fallback

If an attempt that selected context reads fails to compile, the entrypoint
compiles again without context selectors (then without list item memoization,
then without inlining), so the experiment never turns a successful
compilation into a bailout.

## Semantics

Skipping a render is unobservable if the render's output and the values its
closures read depend only on the selected values (the compiler's purity
assumption), which the analysis establishes for every read of the value. What
is not changed: the value a render reads (the full context value), when the
component renders for other reasons (state, props, other contexts), effects,
StrictMode double rendering, transitions (comparisons use the value of the
render in progress), and server rendering and hydration.

Accepted differences: fewer renders of consumers (visible to render counting,
the Profiler and DevTools highlighting), and getters on context values may be
called more often (by comparisons), which render purity already assumes has
no effect.

## Results

Board app (`compiler/apps/todomvc-benchmark/src/board`), 1,000 cards, median ms
(React Compiler with list item memoization, then also with context selectors):

| workload | lists | lists + context selectors |
|---|---|---|
| 50 notifications | 38.0 | 16.3 |
| 50 presence updates | 40.0 | 17.5 |
| select 20 cards | 25.5 | 13.5 |
| star 20 cards | 27.5 | 15.5 |
| rename (30 keystrokes) | 33.1 | 24.6 |
| move 20 cards | 38.6 | 30.9 |
| toggle theme 10 times (every card renders) | 28.9 | 31.3 |
| toggle "only mine" 10 times (mounts) | 104.1 | 105.3 |

Renders per notification: 1,016 before, 2 after. The remaining cost when every
consumer renders anyway (theme) is the start/select calls per custom hook call.

## Tests

- `packages/react-reconciler/src/__tests__/ReactContextWithSelector-test.js`:
  skipping and rendering, selectors capturing props, throwing selectors, memo
  bailouts, state and context changing together, nested providers,
  transitions, StrictMode parity with `useContext`, path descriptions, and
  custom hooks (registered, nested, unregistered, calling other hooks, reading
  two contexts, returning other values).
- `packages/react-dom/src/__tests__/ReactDOMContextWithSelector-test.js`:
  server rendering and hydration.
- Compiler fixtures in `experimental/context-selectors/`.
- The compiler fixture corpus with every experiment forced on, evaluated
  against this repository's React build:
  `SNAP_REACT_BUILD=<repo>/build/node_modules yarn snap --rust --eval-only --force-rust-flag enableContextSelectors ...`
  (see `packages/snap/src/react-build-alias.ts`). Without `SNAP_REACT_BUILD`,
  fixtures using experimental runtime APIs are only compiled, not evaluated.
- `verify.mjs` compares the board apps' DOM after every workload step in every
  variant.
