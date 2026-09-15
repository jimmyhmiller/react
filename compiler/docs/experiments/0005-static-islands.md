# Experiment 0005: Static islands

Status: implemented (runtime and compiler), measured. Idea 6 of `ideas.md`.

## Goal

Hydration creates a fiber for every component and host element of the server
HTML and matches it against the DOM, even for content that is never
interactive. A subtree that has no state, effects, refs, context reads or event
handlers works without fibers: its server HTML is already correct, and nothing
in it responds to events or schedules updates. Such a subtree does not need to
be hydrated unless something later forces it to change.

## Measurements before the experiment

The docs page (`compiler/apps/todomvc-benchmark/src/docs`): a long article,
sidebar, table of contents, and a few interactive parts. Median ms from
`hydrateRoot` to the hydration's commit (`scripts/hydration.mjs`):

| variant | hydration | total script |
|---|---|---|
| React (local build) | 10.0 | 29.1 |
| React Compiler | 10.9 | 30.1 |
| every experiment | 11.9 | 31.6 |

Blocks do not help: most of the article is lists and components, which hydrate
as fibers. Wrapping each article section in `<Suspense>` (an upper bound: the
sections stay dehydrated in the first pass) brings the first commit to 5.3 ms,
but React hydrates the boundaries afterwards, so total script time is
unchanged. A static island is never hydrated, which removes that work.

## Design

### Runtime: `unstable_StaticIsland`

`react/compiler-runtime` exports `unstable_StaticIsland`, an element type with
a `children` prop, behind `enableStaticIslands`. The compiler wraps subtrees
that are likely static; **the server decides** whether they are.

- **Server** (Fizz, `renderStaticIsland`): renders the children and observes
  the render. The content is static unless it calls a hook (other than the
  compiler's memo cache: a wrapping hooks dispatcher marks the island), renders
  an element other than a function component, a fragment, a nested island or a
  host element (class components, Suspense, Activity, portals, providers, lazy
  and memo types count as interactive), renders a host element with an event
  handler, a `ref`, `autoFocus`, `popover`, `popoverTarget` or `formAction`, or
  a hydration-sensitive tag (form controls, media, resources, hoistables,
  `details`, `dialog`, custom elements, singletons), or suspends (its content is
  split into other segments). Static content is written between
  `<!--~-->` and `<!--/~-->`. Other content is written as is (the start comment
  is replaced by a text separator if needed), and an enclosing island is not
  static either. `renderToStaticMarkup` and `react-markup` write no comments.
- **Client, not hydrating**: renders like a visible `<Activity>` (the island's
  props have no `mode`).
- **Client, hydrating**: if the next hydratable node is an island start comment,
  the island claims it like an Activity boundary and stays dehydrated: unlike an
  Activity, React does not schedule hydrating it later. Otherwise the island's
  children are hydrated like any content (the island is not a hydration parent).
- A dehydrated island is otherwise handled like a dehydrated Activity boundary,
  which React already supports: deletion removes its DOM range, hiding (an
  ancestor Suspense boundary showing its fallback) hides its DOM range, an
  insertion before it finds its DOM, and an update that reaches it (new props)
  hydrates it first at a higher priority with its old props, then applies the
  update (selective hydration).
- **Events** inside a dehydrated island are dispatched from its nearest host
  ancestor, like events on DOM nodes React does not own, instead of blocking on
  hydrating it (an island has no handlers).
- **Moves**: a dehydrated boundary's DOM is not moved by placement, so an
  island that is placed again (a keyed list reordering it) is rendered on the
  client instead.
- **Development**: after a dehydrated island commits, React hydrates a copy of
  its server DOM with its children in a detached root and reports hydration
  errors (`A static island's server-rendered HTML does not match...`). The
  island itself stays dehydrated, like in production.

Because the server checks the rendered tree, the compiler's analysis only
decides where checking is worthwhile: content that needs hydration is never
left dehydrated.

Found while implementing: hiding a dehydrated boundary walked its DOM until a
Suspense end comment, so a dehydrated Activity boundary (or island) directly in
a Suspense boundary that shows its fallback also hid the nodes after it. The
walk now counts Activity and island comments.

### Compiler: `enableStaticIslands`

`WrapStaticIslands` (`react_compiler_optimization/src/static_islands.rs`) runs
after `OptimizePropsMethodCalls`, before `CompileJsxBlocks` (the child of an
island is at a fixed position, so its content is still compiled into blocks),
in client and SSR output. It requires the react/compiler-runtime module, and
imports the element type as `StaticIsland` (a JSX tag starting with a lowercase
letter would be a host element name).

- **Static components** (`collect_static_components` in `program.rs`): the
  module components of the inlining analysis (declared at module scope, only
  referenced as JSX tags), lowered on their own, that call no hooks and whose
  every element (in nested functions too) is allowed. The set is computed as a
  greatest fixpoint, so components that render each other are static together.
  Each static component has a weight: the weight of the elements it creates,
  with the elements of a `.map` callback counting at least 3.
- **Allowed elements**: host elements outside the hydration-sensitive tags
  (the server's list), without event handler props, spread props, `ref`,
  `autoFocus`, `popover`, `popoverTarget` or `formAction`, and elements of
  static components.
- **Static subtrees**: an allowed element whose element operands (children, and
  props that are elements) are created only for it and static, and whose `.map`
  children have callbacks with allowed elements. Other operands are allowed
  (props, calls, local variables): the server checks what they render.
- **Wrapping**: top down, an element is wrapped if no enclosing element is, its
  subtree is static, its weight is at least 3 (host elements and unknown
  children count 1, lists 3, static component elements their component's
  weight), and it is at an exclusive position: no other element of the same
  type can be rendered at its positions (`Positions` of the blocks
  experiment, with a variant for component elements), so that replacing its
  type with an island never changes which DOM node or component instance React
  reuses. The island takes the element's key. Lists inside an island are not
  wrapped again, and neither are the elements of static components (their
  callers wrap them), so islands are not nested needlessly.

Props of the subtree may change: a dehydrated island that receives new props is
hydrated then. Server and client must both be compiled with islands (a client
island hydrates server HTML without island comments like any content).

Fixtures: `packages/babel-plugin-react-compiler-rust/src/__tests__/fixtures/experimental/static-islands/`.

## Semantics

Unchanged: the DOM, events, updates, unmounting, Suspense, and every behavior of
components with state, effects or handlers (they are never inside islands).

Accepted differences:

- A mismatch between the server HTML and the client render inside a dehydrated
  island is not detected in production: the server HTML stays. Development
  reports it (see above).
- Components inside a dehydrated island do not run on the client and are not
  visible to DevTools until the island is hydrated.

## Results

Median of 30 page loads, Chromium, production builds of this repository's React
(`scripts/hydration.mjs`); ms from `hydrateRoot` to the commit of the
hydration, and total script time (bundle evaluation included). Islands are
added to the React Compiler alone and to every other experiment.

| page | variant | hydration | total script |
|---|---|---|---|
| docs | React Compiler | 10.7 | 30.4 |
| docs | + islands | **6.9** | **26.5** |
| docs | every experiment | 12.3 | 31.9 |
| docs | + islands | **7.5** | **27.3** |
| board | React Compiler | 15.8 | 34.5 |
| board | + islands | **13.2** | **31.8** |
| board | every experiment | 16.2 | 35.1 |
| board | + islands | **15.3** | **34.2** |

The docs page server-renders 293 static islands. What still hydrates there is
the `Section` and `Block` components of the article: a code block contains a
copy button with state, so neither is static. Islands that contain interactive
holes would remove that work (not implemented).

Interactions after hydration (`bench.mjs --ssr`, median ms): typing into the
search box costs about 1 ms more once (8.0 to 9.0), because it hydrates the
sidebar's island, which was left dehydrated; hydration and search together
still cost less (15.9 against 18.7). Toggling the theme and clicking copy
buttons are unchanged (their islands receive no new props).

`scripts/verify.mjs --ssr` passes for both island variants on every app (island
comments are ignored in the comparison of DOM snapshots). With the flag forced
on, the compiler fixture corpus evaluates identically except for fixtures that
fail without it.

Found while measuring: the server tracked the islands being rendered with a
stack of objects, and Closure Compiler (production bundles) inlined the object
pushed for an island and assumed its flag never changed, so every island was
written as static. Tests run the sources, so they passed; the benchmark's
button inside an island had no handler after hydration. The server now tracks
the innermost island in two variables that it saves and restores.
