# Experiment ideas: using the compiler's dependency graph at runtime

Status: ideas, not implemented, except idea 1 (implemented, see below). They
build on experiments 0001 (component inlining) and 0002 (compiled blocks and
list item memoization).

## What the compiler knows that the runtime doesn't

Per function, the compiler knows:

- The dependencies of every reactive scope, down to property paths
  (`todo.title`, not `todo`).
- Where every value flows: props, block holes, slots, callback captures, hook
  arguments, or an escape.
- Mutation and aliasing: what is frozen, mutated, or aliased.
- Hook kinds and types, including library hooks described by the type provider.
- Rendered positions: which elements and `.map` results are only rendered and
  never inspected (`jsx_block_positions.rs`).

It does not know anything across opaque calls, the runtime identities produced
by immutable updates, or which independent state values change together.

Every idea below must preserve React's semantics: concurrent rendering,
Suspense, StrictMode, effects, and component identity.

## 1. Selections in lists (implemented)

Implemented as part of `enableListItemMemoization`; see "Selections" in
0002-compiled-blocks.md.

Selecting a row in a 1000-row list changes `selected`, so every item's
`selected === item.id` is recomputed and 1000 item caches are compared, even
though only two rows change. Rows benchmark `select-x20`: 4.5 ms, vs Solid's
2.1 ms.

The compiler can see that a captured value is only compared with `===` or
`!==`, and that the `.map` result only flows to a rendered position. When the
list data is unchanged and only such a value changed, the only rows whose
result can differ are the rows that compared it with its old or new value; the
runtime records those comparisons. This is Solid's `createSelector`, derived
automatically, and not limited to comparisons with the key.

## 2. Compiler-generated selectors for context and external stores

A context value or store snapshot changes, and every consumer re-renders even
if it reads a small part. The compiler knows which paths a component reads
from `useContext(Ctx)` or a store hook during render. It could compile the read
into a selector subscription, so that React skips the render when those paths
are unchanged. This fits React's stated direction ("Concurrent Stores with
selectors"); the compiler would write the selectors.

Semantics to handle:

- Callbacks capture the value from the last render. If a handler reads
  `ctx.user.name`, skipping a render would leave it stale, so paths read by
  callbacks are dependencies too.
- If the value escapes (passed whole to a function, child, or hook), the
  selector is the whole value.
- The compiler once had a context selectors experiment that was removed as
  "not a success". Find out why before building this.

Potentially the largest real-world win; the least proven.

## 3. Update slicing

With memo caches and blocks, a re-render is mostly dependency checks, but the
whole function still runs: every hook call, unmemoized code, and every scope
check. For each state variable, the compiler could emit the slice of the render
that depends on it, ending in block holes. When only that state changed, React
(still with its lanes, commit and Suspense) runs the slice instead of the
component.

Constraints: the slice contains no hooks; everything outside it comes from the
committed cache; render-phase updates, `use()`, or throws fall back to a full
render. The gain over memoized re-rendering plus blocks is probably modest for
small components, and grows with unmemoized work. It is also what would make
inlining stateful components cheap (see 5).

## 4. Choosing locality from event handlers

The compiler sees what each handler does (`onChange={e => setText(e.target.value)}`)
and where that state flows. It could decide per site whether to keep a stateful
child as a fiber (its state only affects its own holes) or inline it (its
handlers also update parent state, so updates happen together). Combined with
slicing, a controlled input whose state only feeds its own `value` hole updates
as a single hole patch.

## 5. Inlining stateful components

Rule C3 of experiment 0001 rejects components that call hooks. Hoisting a
child's `useState` to the parent keeps hook order valid, but changes the
state's lifetime: React discards a child's state when it unmounts (condition
false, early return, key change), runs initializers at the child's mount with
the child's props, resets refs, and ignores setters called after unmount.

This can be emulated with a runtime helper hook, like `useListItemMemoCache`:

- The compiler hoists an unconditional helper call; the value is read at the
  original JSX site, where the condition, key and props are known.
- The helper tracks whether the site was rendered (and with which key) in the
  last committed render. It returns a fresh initial value (running the
  initializer lazily at the site) when the site mounts again or the key changes.
- Setters capture a mount generation; updates from an old generation are
  dropped.
- Mount state advances on commit only, so renders that do not commit cannot
  reset or keep state incorrectly. `useRef` resets the same way.
- A keyed variant would store state per list item key.

Still excluded: effects (child effects run before parent effects), `useId`
(derived from tree position), `useContext` across a provider, `use()` across a
Suspense boundary, and error boundaries or Activity between the parent and the
site.

The cost is update locality: the child's state updates now re-render the
parent (for a list item, the whole list callback). It wins when updates come
from above or touch several levels together; it loses for frequent local
updates such as typing in a nested input. The main gain is for blocks: every
stateful component is a fiber boundary that splits templates. Measure both a
top-down update workload and a nested-input typing workload.

## 6. Static islands in hydration

Implemented as static subtrees that the server verifies and the client leaves
dehydrated: see 0005-static-islands.md.

Server rendering and hydration of blocks are implemented (see "Server
rendering and hydration" in 0002-compiled-blocks.md). The compiler knows
which subtrees have no event holes, no state, no effects, no refs, and props
fixed after the first render. Those need no hydration work (no fibers, no DOM
matching), and blocks can hydrate by walking `refPaths` over the existing DOM.
If props provably never change, the subtree never re-renders and its code
could be split out of the client bundle: automatic partial hydration without
manual Server Component boundaries.

## Smaller ideas

- **Effect-derived state.** `useEffect(() => setX(f(y)), [y])` costs an extra
  render and commit. Rewriting it as derived state changes what is painted (one
  frame with the stale value), so it is a lint or codemod, not an optimization.
- **List changes from updaters.** `setTodos(c => c.map(t => t.id === id ? {...t, done} : t))`
  tells the compiler which items can change. Mostly covered by idea 1.
