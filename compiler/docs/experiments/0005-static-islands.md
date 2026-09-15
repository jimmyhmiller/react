# Experiment 0005: Static islands

Status: design, in progress. Idea 6 of `ideas.md`.

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

### Compiler

A JSX element is wrapped in `unstable_StaticIsland` when its subtree looks
static where it is created: host elements without event handlers, refs or
hydration-sensitive props and tags, text, lists, and components of the same
module that call no hooks and only render such subtrees. Values of unknown type
may be rendered (the server checks what they are). The element must be at an
exclusive position (the island replaces it, like a block), and the subtree must
be large enough that skipping its hydration pays for the boundary.

Props of the subtree may change: a dehydrated island that receives new props is
hydrated then. Server and client must both be compiled with islands (a client
island hydrates server HTML without island comments like any content).

## Semantics

Unchanged: the DOM, events, updates, unmounting, Suspense, and every behavior of
components with state, effects or handlers (they are never inside islands).

Accepted differences:

- A mismatch between the server HTML and the client render inside a dehydrated
  island is not detected in production: the server HTML stays. Development
  reports it (see above).
- Components inside a dehydrated island do not run on the client and are not
  visible to DevTools until the island is hydrated.
