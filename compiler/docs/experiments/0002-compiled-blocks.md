# Experiment 0002: Compiled DOM Blocks

Status: in progress. The compiler side is Rust-only (`compiler/crates`) and
gated by `enableJsxBlocks` (default `false`, client output only). The runtime
is React DOM behind `enableCompiledBlocks` (`__EXPERIMENTAL__`).

## Goal

A tree of host JSX elements normally becomes one element object and one fiber
per element and text node, and every update reconciles all of them. A compiled
block renders the tree from a template instead:

```js
// module scope
const T = unstable_createBlockTemplate(
  ['li', null, [['className', 0]], [
    ['div', {className: 'view'}, null, [
      ['label', null, [['onDoubleClick', 1]], [{s: 2}]],
      ['button', {className: 'destroy'}, [['onClick', 3]], []]]]]]);

// component
return <T v={[className, onEdit, title, onDestroy]} />;
```

- The static structure is built once per document and deep-cloned per instance.
- A block is **one fiber** (`HostBlock`) whose `stateNode` is the root element.
- On update, React DOM compares the hole values (`!==`) and patches only the
  changed attributes, listeners and text. There is no diffing of the static
  structure and no fibers for it.
- Arbitrary children (component elements, arrays, conditionals, values of
  unknown type) go in **slots**. Slot values that render as text, as nothing,
  or as a list of keyed blocks are rendered by the block itself, without fibers
  (see "Inline slot content"). Any other slot value is rendered by a
  `HostBlockSlot` fiber whose children are reconciled normally and whose host
  nodes are inserted at the slot's position inside the block.

The block element is an ordinary JSX element whose tag is the template, so
memoization, keys and every compiler pass handle it unchanged.

## Runtime (React DOM)

| Piece | Location |
|---|---|
| Template factory `unstable_createBlockTemplate` | `react-dom-bindings/src/shared/ReactDOMBlockTemplate.js`, exported from `react-dom` |
| Analysis, prototype, instances, updates, slot positions | `react-dom-bindings/src/client/ReactDOMBlocks.js` |
| Fiber tags `HostBlock`, `HostBlockSlot` | `react-reconciler/src/ReactWorkTags.js` |
| Render: slot fibers | `ReactFiberBeginWork.js` (`updateHostBlock`) |
| Complete: create instance, insert slot content | `ReactFiberCompleteWork.js` (`appendAllChildrenToBlock`) |
| Commit: updates, placement into slots, deletion, hide/unhide | `ReactFiberCommitWork.js`, `ReactFiberCommitHostEffects.js` |
| Events | `DOMPluginEventSystem.js` (`accumulateSinglePhaseListeners`) |
| Renderers without blocks | `ReactFiberConfigWithNoBlocks.js` |
| Tests | `react-dom/src/__tests__/ReactDOMCompiledBlocks-test.js` |

### Inline slot content

The kind of a slot is decided from its value on every render
(`getBlockSlotValueKind`):

| Value | Rendered by |
|---|---|
| `null`, `undefined`, booleans, `''` | nothing |
| strings, numbers, bigints | a text node owned by the block |
| an array whose items are all elements with a string `key` whose type is a block template (in development: with no duplicate keys) | an **inline list**, possibly **hybrid** (below) |
| anything else | a `HostBlockSlot` fiber |

A slot switches between kinds as its value changes: fiber content is deleted
before inline content is created, and inline content is removed when the slot
needs a fiber. Two rules keep the host instances of list items exactly as React
would:

- **Adoption.** When a slot that renders an inline list starts to need a fiber
  (for example because a component element joins the list, or an item's slot
  holds an element), each new block fiber whose key and template match an item
  of the inline list takes over the item's DOM and instance instead of creating
  new ones. The match is made while rendering (the slot fiber collects the
  items of the committed inline list; `updateHostBlock` claims one), and the
  commit phase registers the instance with the fiber, before the fiber's slots
  place content into it, then applies the new values over the item's.
- **Sticky fibers.** A slot rendered by a fiber keeps its fiber while it holds a
  non-empty array, even if the array could be rendered inline again, since
  switching back would create new instances for the items. Once the slot holds
  anything else (or an empty list), no instance can be kept and the slot is
  free to render inline again.

**Inline lists.** The items are block instances without fibers, owned by the
enclosing block. On update, the list is reconciled in React DOM
(`reconcileList`):

1. Items with the same key and template at the start and at the end are
   updated in place.
2. The remaining new items are matched to old items by key. In production, a
   key that occurs more than once is matched at most once; the other duplicates
   are created and removed like unmatched items. In development, a list with
   duplicate keys is not rendered inline at all: it is reconciled by fibers, so
   React's own reconciler emits the duplicate key warning with the same
   message, count and component stack as for any other list.
3. Unmatched old items are removed. When every item is replaced and the list is
   the only child of its parent element, the parent is cleared with
   `textContent = ''`.
4. Reused items that are not in the longest increasing subsequence of their old
   positions are moved; new items are inserted. Swapping two rows of a
   1000-row list performs 2 DOM moves (React's fiber reconciliation performs
   997 placements).

Updating an item compares its hole values with `!==` and patches only the
changed ones, including its own inline slots.

**Hybrid lists.** An item whose slots hold something that needs a fiber (a
component element, a portal, or a list with such an item, checked by
`blockListItemNeedsFiber`) gets its own `HostBlock` fiber; the other items stay
fiber-free. In TodoMVC, the row being edited renders an `EditField` component in
a slot: only that row has a fiber, instead of all 1000 (12 fibers in total for
1000 todos, down from 2011).

- The list slot has a `HostBlockSlot` fiber whose children are only the item
  fibers, reconciled with React's normal child reconciliation (keys, deletions,
  effects, refs, Suspense and error handling of the items' contents are
  unchanged). The element array passed to it holds `null` at the positions of
  fiber-free items, so indices stay aligned.
- React DOM's `reconcileList` positions *all* item roots, including those owned
  by fibers (`ownedByFiber`), with the same two-ended scan, key map and LIS
  moves. It never creates, updates or removes a fiber-owned item: the fiber
  does, in its commit. `commitPlacement` does not insert children of a list
  slot, so each item root is placed exactly once.
- Removing fiber-free items skips fiber-owned roots, and the `textContent`
  fast path is only taken when no fiber owns an item.
- **Adoption** also applies per item: when a fiber-free item starts to need a
  fiber, the new fiber takes over the item's instance and DOM (same key and
  template).
- **Sticky item fibers.** An item keeps its fiber while it is in the list, even
  if it no longer needs one, since returning to a fiber-free item would need
  the reverse of adoption. Its DOM stays in place either way; only the cost of
  its updates differs.
- The decision is made in `updateHostBlock` while rendering, from committed
  state only (which items of the current slot have fibers), so a render that
  does not commit leaves nothing behind. An element that is identical to the
  one at the same index of the previous fiber-free render is not re-checked.

Keys that are not strings (for example optimistic keys) make the whole list use
fibers.

**Event listeners** are read at dispatch time from the committed hole values
of the block instance a node belongs to (`getBlockEventListener`). Updating a
listener therefore costs nothing beyond committing the new values array, which
matters for list items whose callbacks are recreated on every render.

Semantics that are preserved:

- **Props** are applied with React DOM's own `setProp`: sanitization, boolean
  and numeric attributes, `style` diffing, and the iOS click trap for `onClick`.
- **Events** go through the normal delegated root listener. Nodes inside a block
  have no fibers, so listener accumulation walks the block's DOM from the event
  target (or from the parent element of the slot the event came from, which also
  covers portals) up to the block root. Capture and bubble order,
  `currentTarget`, and `stopPropagation` match host components. The dispatch
  loop treats a change of `currentTarget` as a propagation boundary, because all
  nodes of a block share one fiber.
- **Slot insertion** during updates inserts before the first stable host node of
  a later slot at the same position, or else before the next static sibling.
- **Suspense and Activity** hide and reveal the block root like a host component.
- **Fragment refs and view transitions** treat the block root as a host instance
  and a slot as a host parent.

Explicit errors instead of silent misbehavior (all have production error codes
609-620 in `scripts/error-codes/codes.json`):

- **Hydration**: `Compiled blocks do not support hydration yet.`
- **Server rendering** (Fizz): `Compiled blocks cannot be rendered on the server yet.`
- **Gesture transitions**: `Compiled blocks do not support startGestureTransition() yet.`
- **SVG/MathML content**: `Compiled blocks can only be rendered inside HTML content, not inside <svg> or <math>.`

Known, accepted differences from host components (not observable through props,
events, layout or `textContent`):

- Inline lists move fewer DOM nodes than keyed fiber reconciliation. The final
  DOM is identical; the number and order of intermediate DOM mutations (visible
  to a `MutationObserver`) differ. A focused element keeps focus in more cases.
  This is the purpose of the optimization.
- With duplicate keys in production, the items that are reused can differ from
  fiber reconciliation (whose behavior with duplicate keys is unsupported). In
  development, such lists use fibers, so warnings and behavior match exactly.
- Attributes of an element are created statics first, then dynamics, so
  `getAttributeNames()` or serialized HTML can list them in a different order.
- A text hole always owns a text node, which may be empty (React creates none for
  `''`). Serialized HTML is identical.
- Nodes inside a block are invisible to fiber-based tooling (DevTools, test
  selectors, the Scope API); only the block root is a host instance.

## Compiler rules (`react_compiler_optimization/src/jsx_blocks.rs`)

An element joins a block only if React DOM renders it identically from a
template:

1. The tag is one of a fixed list of plain HTML elements, including `input`.
   Excluded: other form controls, `form`, `select`/`option`, media and `img`,
   hoistables and singletons, `details`/`dialog`, custom elements, SVG and
   MathML.
2. No spread props, and none of `ref`, `children`, `dangerouslySetInnerHTML`,
   `autoFocus`, form actions, `popover*`, `contentEditable`, or namespaced
   attributes. `value`, `defaultValue`, `checked` and `defaultChecked` are
   allowed only on `input`, which keeps React DOM's controlled input handling.
3. Event props only for events React DOM delegates: those dispatched by the
   SimpleEventPlugin (click, key, mouse, pointer, drag, focus, clipboard, touch,
   wheel) and the form events dispatched by plugins (change, input, select,
   before-input, composition, invalid), plus their `Capture` variants.
   Enter/leave and non-delegated events are excluded.
4. A `button` or `input` with a `disabled` prop is excluded (React DOM
   suppresses their mouse events based on props).
5. A child element is absorbed into its parent's template when it satisfies the
   rules, has no `key`, and is used only by the parent (looking through
   single-use loads, as left by component inlining).
6. Children: JSX text and string/number literals become static text; `null`,
   `undefined`, booleans and `''` render nothing; values proven to be strings or
   numbers (template literals, arithmetic, `typeof`, unary `+`/`-`/`~`) become
   text holes; everything else becomes a slot.
7. A tree must contain at least two elements. The root may have a `key` (moved
   onto the block element) but no `style` (hiding and revealing resets the
   root's `display` from props, which a block does not carry).
8. The root must be at an *exclusive position* (`jsx_block_positions.rs`). A
   block has a different type than the host element it replaces, and React
   keeps a host instance only when the element at the same position has the
   same type. So the root is compiled only if every use of its value ends in a
   child of a host element or fragment, the return value of a component, or an
   item returned by a `.map` callback whose result is only rendered as such a
   child or returned by a component; and every other value that can reach the
   same position (through variables, conditionals or other returns) is a
   primitive, a fragment, a component element, or a host element with a
   different tag. Values of unknown type (props, calls) are assumed to be able
   to be any element. Elements passed to components, returned by hooks, or put
   into arrays are not compiled.

The pass runs in SSA form after `InferTypes`, on the component and all nested
functions. Unlike component inlining (experiment 0001), blocks help inside
`.map` callbacks: the callback still creates one element per item, but each
update patches holes instead of reconciling every host fiber.

A single element (normally rule 7 requires two) also becomes a block when one
of its children is a slot holding the result of a `.map` call, so that the
list is rendered by a block slot (fiber-free) instead of by host fibers.

The pass also records what the compiled function returns (`ReturnsBlock`):
- `LeafBlock`: every returned value (following local stores and loads) is a
  block element none of whose slot values may be JSX (a JSX type, or a phi with
  a JSX operand);
- `Block`: every returned value is a block element, whose slots may hold JSX;
- `No` otherwise.

With `enableComponentInlining`, a component is inlined into a rendered `.map`
callback only if it returns a leaf block, or, with
`enableListItemMemoization`, any block. Its items then are keyed blocks that
React DOM renders without fibers (or with a fiber for just the items that need
one), and per-item memoization replaces the component's memoization boundary.
Without list item memoization, a non-leaf component stays a component: every
row would otherwise re-render with the list.

A component's `ReturnsBlock` status is computed the way the component is inlined: with
the other candidates inlined into it (`compute_leaf_blocks` in
`entrypoint/program.rs`). Inlining a child can replace a slot holding the
child's element with host elements of the same block, so the status is
iterated to a fixpoint over all candidates; it only ever changes from false to
true. When such a component is inlined into a callback, the sites inside its
body are inlined as they were in that computation.

**Shared templates.** Templates are keyed by their structure
(`BlockNode::structure_key`). The program context keeps the module's known
templates (rolled back with speculative compilations), and a function that
creates a template identical to a known one reuses its name. Each function
still lists every template it references, so a template is declared whenever
any function using it is emitted; the program declares each name once.

## Per-item memoization of lists (`enableListItemMemoization`)

Status: in progress, Rust-only, default `false`, requires `enableJsxBlocks`,
client output and the `react/compiler-runtime` module (target 19).

The compiler does not memoize values inside callbacks, so each render of a list
recreates every item's element, values array and event handlers, and React DOM
compares every hole of every item. With this flag, a `.map` callback whose
items are blocks rendered by a block slot memoizes each item:

```js
function Table(t0) {
  const $ = _c(11);
  const _listItemCache = useListItemMemoCache();
  ...
  t2 = (item) => {
    const t4 = item.id;
    const t5 = item.id === selectedId ? "danger" : "";
    ...
    const $0 = _listItemCache.next(7, t4);
    let t8;
    if ($0[0] !== item || $0[1] !== onSelect || $0[2] !== t4 || $0[3] !== t5 ...) {
      t8 = <_BlockTemplate key={t4} v={[t5, t6, () => onSelect(item.id), t7]} />;
      $0[0] = item; ...; $0[6] = t8;
    } else {
      t8 = $0[6];
    }
    return t8;
  };
```

An unchanged item returns the element of the previous render, which React DOM
skips without comparing its holes, and allocates nothing.

**Compiler** (`react_compiler_optimization/src/memoize_list_items.rs`, after
`AnalyseFunctions`, and `react_compiler_reactive_scopes/src/memoize_list_item_body.rs`,
right before the callback's codegen):

- A callback is selected if it is an arrow function (not async, not a
  generator, not reading `arguments`) passed as the only argument of `.map`,
  whose result is a block slot and whose returns are blocks (items that need
  fibers get them individually, see "Hybrid lists"), with a single `return`
  whose element is created in the `return`'s block, with no reassignment of
  any variable after that element's first allocation, and that (with its
  nested functions) uses no context variable.
- The component calls `unstable_useListItemMemoCache()` once per list, at its
  start, and the callback captures the result.
- The pure allocations that produce the returned element (the element, its
  values array, closures, object and array literals, template references,
  constants and reads of locals) are moved, in order, into a reactive scope
  right before the `return`. Its dependencies are everything else they read,
  including the variables captured by the closures; its output is the element.
  `const` variables that hold such an allocation (not an alias of another
  local) and are read once, by another allocation, are moved with it. Because
  nothing is reassigned after the first allocation, moving the allocations
  after the callback's other instructions does not change what they read. Codegen emits the scope like any
  reactive scope, with `const $ = listItemCache.next(N, key)` right before it.
- If an attempt that memoized a list fails to compile, the entrypoint compiles
  the component again without list item memoization.

**Runtime** (`react/compiler-runtime`, `unstable_useListItemMemoCache`): the
list cache lives in a `useMemoCache(1)` slot of the component, so it is fresh
exactly when the component's memo cache is (mount, second StrictMode render).
The n-th `next(size, key)` call of a render reuses the cache of the n-th call
of the previous render that made calls, or, if that call had a different key,
the cache of the previous call with the same key. Unless
`enableNoCloningMemoCache` is on, a reused cache is copied before it is
written, so a render that does not commit never modifies a cache that another
render reads; like with `enableNoCloningMemoCache`, a later render may start
from the caches of such a render, which is safe because every output is stored
with its inputs.

### Selections

Selecting one row of a list changes a value every item compares
(`item.id === selectedId`), so every item's cache is checked even though two
rows change. A value that a memoized callback captures and uses only as an
operand of `===` or `!==` in its own body is a *selection*
(`memoize_list_items.rs`):

```js
t1 = (item) => {
  const selected = _listItemCache.is(0, item.id);   // was: item.id === selectedId
  ...
};
t2 = _listItemCache.map(items, t1, [selectedId]);   // was: items.map(t1)
```

- `is(index, comparand)` returns exactly `selections[index] === comparand`
  (`!==` becomes `!is(...)`) and records the comparand for the item being
  computed.
- The callback no longer captures the selections, so its own memoization no
  longer depends on them: its identity stands for everything else it reads.
- Recording comparands is only useful if the same array is mapped again, so
  `map` records them only when it maps the same array as the previous time:
  a render that changed the array maps every item without recording, the
  first selection change after it maps every item and records, and later
  selection changes use the recorded comparands. (Measured: recording on every
  full map cost 1.5-4% on workloads that change the list on every render.)
- When `map` receives the same array and callback as last time, only
  selections changed. An item's result can only differ if it compared a changed
  selection with a value equal to the old or new selection; every other item
  would evaluate the same comparisons with the same results and (render being
  pure) return the same element. `map` calls the callback only for those items,
  and returns a copy of its previous result with them replaced. Map lookups use
  SameValueZero, which can only add items (those that compared `NaN`), never
  miss one. Duplicate comparands (a selected group) recompute every matching
  item.
- The copy records `{base, indices}` under `Symbol.for('react.list_changes')`.
  React DOM uses it only if `base` is the list it committed and every replaced
  item has the key and type of the item it replaces
  (`getBlockListChanges`); otherwise the list is reconciled as usual. The
  slot is then classified, checked for items that need fibers, and updated by
  looking only at the replaced items. In development every other item is
  checked to be identical, and a mismatch is reported as a React bug.
- Non-arrays (anything else with a `map` method) and arrays whose `map` was
  replaced are mapped as written; holes of sparse arrays are skipped like
  `Array.prototype.map`. A render that throws or suspends while mapping leaves
  the previous state unchanged.
- Not selections: values read by nested functions (an event handler reads the
  value of the render that created it), compared with `==`, compared with
  another captured value, or used in any other way.

The rewrite runs before AnalyseFunctions, so that the effects of the rewritten
callback and of the `map` call are inferred from the rewritten code. (Before
AnalyseFunctions the context of a nested function can list values it does not
read, so reads in nested functions are found by scanning their bodies.) Other
callbacks are memoized after AnalyseFunctions as before.

Tests: `packages/react-reconciler/src/__tests__/useListItemMemoCache-test.js`
(position and key reuse, separate lists, renders that skip the callback,
StrictMode parity with `useMemoCache`, render attempts that suspend; for
selections: which items are recomputed, recorded changes, `NaN`/`-0`/type
semantics, duplicate and conditional comparisons, holes and non-arrays, a
suspended partial recompute), the React DOM tests "updates only the replaced
items of a list that records its changes" and "gives a fiber to a replaced
item that needs one", and the fixtures under
`experimental/list-item-memoization/`.

## Tests

- React DOM: `yarn test --release-channel=experimental ReactDOMCompiledBlocks`.
  Most tests render the same UI as JSX and as a block and require identical
  DOM after every update. The inline list tests include a 300-step randomized
  sequence of inserts, removals, moves, swaps, shuffles, replacements and
  clears that also checks that surviving rows keep their DOM nodes, and a test
  that a swap in a 1000-row list performs exactly 2 moves.
- Compiler: `yarn snap --rust --experimental`, snapshots only.
  The sprout runtime does not use a React build with blocks.
- End to end: `compiler/apps/todomvc-benchmark/scripts/verify.mjs` runs every
  benchmark workload in every variant and compares the DOM after each step with
  the uncompiled app.
