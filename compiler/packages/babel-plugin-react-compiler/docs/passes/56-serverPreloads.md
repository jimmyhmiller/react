# Server data preload plans

## Source-declared reads (preferred)

Declare the semantic boundary once, beside the backend read:

```ts
import {createServerRead} from 'react-compiler-runtime/server';

export const getProduct = createServerRead(async (id: string) => {
  return db.product.findUnique({where: {id}});
});
```

Components keep writing `await getProduct(id)`. The returned function provides
request caching, promise/error identity, scheduler admission and cancellation
observation itself; do not add another React `cache` wrapper. It also has a
nonblocking `getProduct.preload(id)` method. Preload failures are observed and
surface through the eventual consumer, not from the preload call.

`createServerRead` declares that its callback is a render-safe, speculative read:
no writes, required per-call effects, authorization transitions or transaction
changes. It may run even if an earlier read fails and its consumer is never
reached. Inputs are primitive key tuples; ambient context must remain stable
throughout the request. Backend I/O must be performed directly, not by awaiting
another resource admitted to the same bounded scheduler pool. Results must be
ordinary data, without custom thenables or observable `then` accessors. This is
an application/library contract; JavaScript cannot prove what an opaque database
or network driver does.

Result inspection is a separate, optional stronger contract:

```ts
export const getProduct = createServerRead(loadProduct, {
  result: 'immutable-data',
});
```

Without it, the result is `unknown`: independent reads can still overlap, but
the compiler does not speculate through unknown property access. The existing
`primitive`, `immutable-data` and `array` contracts below apply unchanged.

The graph/esbuild integration needs no per-resource list:

```js
plugins: [serverPreloadsEsbuildPlugin()]
```

The compiler recognizes stable module-level `const` declarations initialized
with a named or namespace import of `createServerRead` or
`createBatchedResource` from `react-compiler-runtime/server`. Import renaming is
supported. Resource export aliases, defaults through named bindings, and barrels
retain their origin contracts. The single-file Babel pass discovers local
resources; cross-module discovery requires the graph integration. Factory
re-exports, dynamic factory selection, destructuring, inline anonymous default
factory exports and arbitrary wrapper factories are not inferred. Unsupported
forms remain ordinary calls. Source-declared options must be an object literal
without spreads/accessors/computed keys; `result` must be a literal contract.

`createBatchedResource(loadMany, {maxBatchSize: 100, result: 'immutable-data'})`
uses the same source contract and is discovered automatically. Existing explicit
configuration remains available for external functions/library adapters. An
explicit result contract may strengthen a source declaration's default
`unknown`; contradictory explicit result contracts fail compilation.

### Single and batch loading through one API

```ts
export const getUser = createServerRead(
  async (id: string) => db.user.findUnique({where: {id}}),
  {
    result: 'immutable-data', // optional, separate from batching
    maxBatchSize: 100,
    async batch(keys) {
      const ids = keys.map(([id]) => id);
      const rows = await db.user.findMany({where: {id: {in: ids}}});
      const byId = new Map(rows.map(row => [row.id, row]));
      return ids.map(id => ({
        status: 'fulfilled' as const,
        value: byId.get(id) ?? null,
      }));
    },
  },
);
```

Ordinary component calls and `.preload()` use the same resource identity. The
compiler extracts supported independent keys across functions, guarded branches,
immutable loops and component boundaries; the request scheduler groups admitted
keys until dispatch. Data-dependent keys wait for their inputs. No component
body or batch callback is executed by the compiler. Bulk callbacks stay opaque
I/O boundaries, with source export aliases/barrels following the resource rather
than its implementation.

The batch callback must implement the same per-key values/errors as the single
loader, including missing records. Its inputs are a frozen list of frozen
primitive argument tuples. Return exactly one fulfilled/rejected envelope per
key in input order. A per-key rejection affects that key; a thrown/rejected
batch or malformed output rejects all participating keys. Duplicate keys share
one pending operation and cached outcome. Cancellation, speculative budgets,
demand promotion and request isolation use the existing scheduler protocol.

When `features.batching` is false, each key calls the **single loader**, under
the same operation cap and cache. With batching on, even singleton groups may
call `batch`. `maxBatchSize` bounds keys per backend operation and requires a
batch callback; it defaults to 100 when a callback is supplied. Definitions are
captured at creation, so mutating the original options cannot change dispatch.
Callbacks run without an options-object receiver. Named callback references,
function-valued properties and ordinary methods are supported; accessors,
computed options keys and spreads are rejected for source discovery.

Factory-defined backend callbacks must do native I/O rather than awaiting or
preloading another managed read on the same request scheduler. The runtime
checks this across async continuations and raises a descriptive error instead
of deadlocking a saturated pool. Composable resource dependencies belong in
component/helper code, where the compiler can see them; wrapping an external
request-owned DataLoader remains supported.

To adapt an existing request-owned loader, wrap its native loading boundary:

```ts
export const getUser = createServerRead((id: string) => {
  return currentRequestLoaders().users.load(id);
});
```

The loader must satisfy the read contract and belong to the current request.
Its existing batching may continue to operate. Do not wrap a whole router loader
that redirects, authenticates or mutates; keep those operations outside the read.
Use `createBatchedResource` when this runtime should own bulk dispatch instead.

Direct/manual calls need the same active React request or explicit host owner
as compiled calls. Before-render/router preloads must share an explicit
`createServerPreloadRequest` owner with rendering; React's `cache` alone does
not provide before-render deduplication. Feature switches remain unchanged;
`preloading: false` disables `.preload()` and generated speculation while direct
demanded calls retain caching. No cache is shared between requests.

### Prior art and deliberate differences

- React's historical experimental
  [`unstable_createResource`](https://github.com/facebook/react/blob/v16.8.0/packages/react-cache/src/ReactCache.js)
  exposed separate `read` and `preload` operations over shared work. Its read
  suspended synchronously; our callable returns a promise for async Server
  Components. We do not copy its module-global LRU caching model.
- The React working group's
  [built-in Suspense cache proposal](https://github.com/reactwg/react-18/discussions/25)
  describes a lazily populated immutable snapshot, cache-owned lifetimes and
  integration with external backing stores. Our resources keep task/results in
  the request owner, with no module-global data cache.
- Modern React [`cache`](https://react.dev/reference/react/cache#preload-data)
  documents starting cached work early and consuming it later. Our compiler
  automates that pattern and adds an explicit speculation contract that ordinary
  `cache` does not express.
- [DataLoader](https://github.com/graphql/dataloader) supplies the model for
  request-scoped batching and deduplication. Our existing batch API preserves
  per-key outcomes and ordering rather than inventing bulk database queries.

`createServerRead` is an experimental API in this fork's compiler runtime, not a
shipped or endorsed React API. It is a resource abstraction inspired by these
precedents, not an implementation of an accepted React RFC. Purity cannot be
established merely by naming a function or giving it a Promise return type.

## Build integration

Use the server compiler in the **Server Component build**. `ssr` retains its
existing client-component SSR meaning; the new `server` entrypoint does not emit
client memo caches or execute component bodies speculatively.

For esbuild, module graph analysis, resource identity resolution, companion
imports/exports, barrels, and rebuild invalidation are automatic:

```js
import {build} from 'esbuild';
import {serverPreloadsEsbuildPlugin} from 'babel-plugin-react-compiler/esbuild';

await build({
  absWorkingDir: projectRoot,
  entryPoints: ['./src/Page.tsx'],
  platform: 'node',
  bundle: true,
  plugins: [serverPreloadsEsbuildPlugin({
    resources: [
      {source: './src/data', importSpecifierName: 'getProduct', result: 'immutable-data'},
      {source: './src/data', importSpecifierName: 'getSeller', result: 'immutable-data'},
      {source: './src/data', importSpecifierName: 'getReviews', result: 'primitive'},
    ],
    preloads: {mode: 'compile'}, // 'analyze' emits no scheduling code
  })],
});
```

Resource paths resolve relative to `absWorkingDir`, through esbuild's resolver,
including aliases. Contracts follow the resolved export identity through stable
export aliases and barrels. An unrelated module with the same relative import
spelling does not inherit a contract. Node_modules, virtual modules, dynamic
component identities, client/action boundaries, and unknown calls are opaque
unless explicitly integrated. Dynamically imported file entries are analyzed
when loaded. Original source maps and watched dependencies are retained, and a
rebuild derives fresh metadata from source.

The default emitted runtime is the separate Node entrypoint
`react-compiler-runtime/server`. Install/build the matching runtime package with
the compiler. It captures Node async context; it is not imported by the client
runtime. A portable server host can supply `preloads.runtime` implementing the
same protocol, or select `runtime: null` for the restricted inline-only backend.
The adapter rejects accidentally using the Node runtime in a browser build.

Other bundlers can call `compileServerPreloadGraph` directly:

```js
import {compileServerPreloadGraph} from 'babel-plugin-react-compiler/server';

const graph = await compileServerPreloadGraph({
  entryPoints: [entryModuleId],
  resources,
  resourceBase: configurationModuleId,
  resolve: async (specifier, importer) => resolvedIdOrNull,
  load: async id => originalSource,
});
// graph.modules.get(id): {code, map, dependencies, summaries}
```

`resolve` returns a canonical module ID for analyzed ESM source, or
`{id: canonicalModuleId, opaque: true}` for a dependency whose body must not be
loaded/analyzed. Preserve resolved identity even for excluded dependencies: two
installed copies of the same package must not inherit one another's contracts.
Return null only for a globally identified external specifier. CommonJS bodies
remain opaque; the esbuild adapter also leaves `.cjs`/`.cts` files untouched. The driver analyzes a
complete source snapshot to a summary fixed point before emitting modules. It
handles cycles, default and named exports, stable aliases, star exports, and
ambiguous re-exports. Type-only edges never become runtime dependencies. It does
not guess the meaning of external code. `preloads`, `compilerOptions`, and
`parserOptions` configure the driver without manual child metadata plumbing.

The single-file Babel interface remains available:

```js
{
  outputMode: 'server',
  serverPreloads: {
    resources: [{source: './data', importSpecifierName: 'getReviews'}],
    mode: 'compile',
  },
}
```

Single-file resource sources match import specifiers. The graph driver resolves
contracts to actual module identities. Single-file users can supply imported
companion summaries through `serverPreloads.components`; the graph adapter does
that automatically.

Explicit module-local cached bindings are supported as well:

```js
serverPreloads: {
  resources: [],
  localResources: [{name: 'getProduct', result: 'immutable-data'}],
}
```

The graph driver derives these declarations automatically from configured export
identities, including resources defined beside components. Resource
implementations remain opaque; their internal operations are not recursively
scheduled as helpers. Conflicting/duplicate contracts are rejected.

## Resource contracts

Each configured import is an application/framework semantic contract:

- It is a stable, shared, request-cached read, such as a module-level React
  `cache` wrapper. Repeating a call with matching primitive keys returns the same
  ordinary native promise or rethrows the same cached synchronous error. There
  is no observable per-call work, TTL update, write, authorization check, or
  ambient tenant/transaction mutation.
- Keys are primitive values, including undefined, null, symbols, and bigint.
  Unknown object/function keys are rejected by the managed runtime protocol.
- Starting work speculatively is permitted, including when an earlier eligible
  read fails and the original program never reaches this read. Contracts must
  not authorize crossing an actual authorization or unknown-effect barrier.
- Native promises and standard intrinsics have unmodified behavior. Custom
  thenables and promise subclasses with custom methods/species are not eligible.
- The resource owns cancellation of its underlying shared I/O. The scheduler
  cancels its queued work/observers for the request; abandoning an individual
  component does not abort an operation another component needs.

`cache`, a Promise return type, TypeScript annotations, or a function name alone
never establish eligibility. Reads require a source declaration or an explicit
external contract.

`result` specifies what additional operations are safe to extract:

| Result contract | Meaning |
| --- | --- |
| `unknown` (default) | Do not inspect returned objects in a plan. |
| `primitive` | A primitive result. |
| `immutable-data` | Recursively immutable plain records/native arrays/primitives, without getters, proxies, functions, custom prototypes/iterators, or thenables. |
| `array` | An immutable native array of that data, with ordinary iteration. |

These are effect contracts, not inferred structural types. Unknown shapes retain
property-access barriers. Mutable local arrays/objects can be understood before
escape; an unknown effect invalidates those local data proofs. Resource-backed
immutable data retains its explicit contract. Whole-props field proofs are also
invalidated across unknown effects.

## Generated behavior

Input:

```jsx
async function Page({id}) {
  const product = await getProduct(id);
  const flags = await getFlags(id);
  return <Seller id={product.sellerId} />;
}

async function Seller({id}) {
  const seller = await getSeller(id);
  const reviews = await getReviews(seller.reviewId);
  return <ReviewList reviews={reviews} />;
}
```

The compiler extracts a plan that starts product and flags together. Once
product resolves, it starts Seller's plan without waiting for flags or invoking
Seller's render body. Seller's plan starts reviews as soon as seller resolves.
Ordinary preload compilation keeps the original control flow, awaits, and rendering. The separately opted-in deferred-consumption transform is described below.
Conceptually:

```js
async function preloadPage(id) {
  const productTask = read(getProduct, [id]);
  const flagsTask = read(getFlags, [id]);
  const product = (await productTask).value;
  plan(preloadSeller, [product.sellerId]);
  await flagsTask;
}

async function preloadSeller(id) {
  const seller = (await read(getSeller, [id])).value;
  await read(getReviews, [seller.reviewId]);
}
```

`read` is a compiler/runtime protocol returning a private value envelope.
For ordinary preloading, consumed reads become `(await read(resource, keys)).value` at the same
consumption sites. The envelope has a null prototype and prevents re-assimilation
of an already fulfilled value: even an unknown result's `then` getter is not
invoked again just because scheduling was added. Resources are shared by stable
function identity and key tuples inside the request.

Every speculative promise is observed immediately. Cached synchronous failures
and early rejected promises are delivered by the original consumer, in its
original await/error-boundary order. A copied catch rethrows scheduler
cancellation/budget exhaustion rather than treating it as a domain failure.
Speculative failures never become renderer errors merely because a plan started.

Plan computations consist only of proven reads, stable values, and pure data
operations. The extractor can specialize visible synchronous field/value helpers
from proven inputs and derive plans for visible async helpers. Unknown effects
truncate a plan. A helper with an incomplete plan can preload its safe prefix,
but its original call remains an ordering barrier and its return value is not
invented. Unknown helper return values are not speculatively returned through a
new promise, which could trigger an unproven thenable accessor.

## Control flow and streaming

Guarded `if`/conditional JSX reads retain their guards. A data-dependent guard
waits for its prerequisites; an early-return dependency prevents following reads
from being hoisted unconditionally. Known React Suspense/Fragment boundaries
allow inspection of their children without changing reveal topology or
preloading fallback content. The compiler does not descend through opaque
components to guess how they use `children`.

All JSX argument evaluation must be understood before child plans move earlier.
A getter, spread, or unknown call anywhere in a returned JSX expression can be a
barrier, including an expression textually after a child: parent JSX evaluation
happens before rendering children.

Proven immutable array `for..of` loops can start independent iterations through
the shared scheduler. Consumption/error precedence follows iteration order.
Mutation, custom iterators, escaping state, and loops that may return/break out
of their containing computation are retained unless proven safe. Queue and plan
budgets bound speculative expansion; budget exhaustion never creates a failed
cache entry that poisons a later demanded read.

Known safe exception regions can be copied into a plan, with resource starts
confined to their regions. Unknown guards, writes, transactions, redirects,
not-found calls, catches, and finally effects remain in the original execution.
The pass can optimize a later safe segment after an ordering barrier without
moving it ahead of that barrier.

A plan never awaits completion on behalf of the rendering parent. The renderer
can send parent content while child resource work is pending. Plans do not keep
an otherwise finished response open and do not call components directly.

## Request runtime, budgets, and diagnostics

The Node runtime captures request/async context at scheduling time, including
queued resource starts and dependent continuations. By default its state is
owned by React's request cache, and `cacheSignal` (when available) ends its
lifetime. Streaming hosts can explicitly bind their lifetime and budgets:

```js
import {createServerPreloadRequest} from 'react-compiler-runtime/server';

const request = createServerPreloadRequest({
  maxConcurrent: 8,
  maxQueued: 128,
  maxPlanSteps: 1024,
  signal: incomingRequestAbortSignal,
  onEvent(event) { /* source label, timing, queue/consumption/cancellation */ },
});

request.run(() => startRenderer());
// Tie these to actual response completion/abort, not parent shell completion:
response.once('finish', () => request.close());
response.once('close', () => request.close());
```

`runWithServerPreloads({signal, ...budgets}, render)` joins an existing lifetime.
For React versions without `cacheSignal`, supply the host lifetime explicitly.
Resource implementations can access `getServerPreloadSignal()` to cancel their
own I/O. The client runtime contains none of this Node machinery.

The concurrency limit applies to runtime-managed reads. Original demanded work
promotes queued speculation; unrelated uncompiled/native resource calls remain
under their own owner's policy. Queue limits bound speculative retention and
plan-step limits bound recursion, loops, and new speculative task creation. A
new request has a new task/plan cache. No module-global resource result cache is
introduced.

Runtime events include source labels, active/queued counts, monotonic elapsed
and duration times, consumption, drops, and cancellation. Compiler
`ServerPreload` events give locations and retain/preload/skip reasons.
`ServerPreloadSummary` events and graph module summaries describe companion
signatures, helper/component kind, result proof, and completeness. Export-name
conflicts do not advertise unavailable companions.

Analysis mode and `noEmit` emit no runtime imports/work. Source filters, function
selection, directives, and import shadowing are honored. Client and Server Action
modules are excluded. Memoization gating is rejected. A generated module carries
`use react server preloads` so repeated compilation is idempotent.

## Validation

The unit suites execute generated JavaScript with controlled deferred promises,
including error precedence, cancellation, budgets, branches, early returns,
unknown getters/coercions, helper inference, loops, scope/shadowing, and request
context. Graph suites cover identities, aliases, barrels, cycles, ambiguous stars,
type-only exports, and analysis mode. Integration tests build with the real
esbuild adapter, check rebuild invalidation and client-bundle separation, and
render through matching experimental Flight/React packages.

Run from `compiler/`:

```sh
yarn workspace babel-plugin-react-compiler jest --config scripts/jest/main.config.js --runInBand
yarn workspace react-compiler-runtime test
yarn snap
```

A controlled timer benchmark (not a production latency claim) exercises the same
Flight graph, reports completion/shell p50, native request count, and peak
concurrency:

```sh
node --conditions=react-server packages/babel-plugin-react-compiler/scripts/benchmark-server-preloads.cjs 7
```

## Batching across component boundaries

Define a stable module-level bulk resource using the separate server runtime:

```ts
import {createBatchedResource} from 'react-compiler-runtime/server';

export const getUser = createBatchedResource<readonly [string], User | null>(
  async keys => {
    const ids = keys.map(([id]) => id);
    const rows = await db.user.findMany({where: {id: {in: ids}}});
    const byId = new Map(rows.map(row => [row.id, row]));
    return ids.map(id => ({
      status: 'fulfilled' as const,
      value: byId.get(id) ?? null,
    }));
  },
  {maxBatchSize: 100},
);
```

Keep component code as `const user = await getUser(id)`. The compiler discovers
the declaration automatically; put an optional stronger result contract in its
options, or retain an existing explicit `resources` registration. The compiler's plans discover keys across component boundaries; the
runtime collects admitted keys until the next microtask dispatch. It does not
invent the database query. The function already caches direct calls per request,
including their promise identity; wrapping it in React `cache` is unnecessary.

The callback receives frozen primitive key tuples and returns exactly one plain
result envelope per key, in the same order. Use `{status: 'rejected', reason}` for
a per-key failure; throwing or rejecting the callback rejects all keys in that
batch. Sparse, missing, or malformed result envelopes reject the batch. Returned
values must be ordinary data without thenables or observable `then` accessors.
An `immutable-data` result annotation additionally requires the existing full
immutable-data contract. Missing rows can be explicit fulfilled null values.

Concurrency counts a whole backend batch as one operation. Twenty admitted keys
can form one batch even with `maxConcurrent: 1`; `maxBatchSize` splits larger
sets. `maxQueued` bounds pending speculative keys, including keys collecting in
a microtask; zero disables speculative batch collection. Demand bypasses that
speculation budget. Duplicate keys share one result, and dropped speculative
keys can still be demanded later. Batch callbacks perform underlying bulk I/O
directly; they must not await another resource scheduled in the same bounded
pool, which could deadlock a saturated pool.

All pending keys, cached results, failures, and cancellation observers belong to
the renderer request. Batch callbacks run in the captured context of their
request. As with other trusted resources, context affecting a result must be
stable for that request or explicit in its keys; tenant/auth transitions cannot
be hidden inside a shared batch. Underlying I/O remains resource-owned. Use the
explicit host lifetime API outside an active React Server Component request.

## Critical-path scheduling

The default queue policy is `scheduling: 'critical-path'`. Demanded reads always
precede speculation. Among queued speculative reads, the scheduler favors a
longer known downstream dependency path; equal scores preserve enqueue order.
It never preempts a running operation. Settled operations allow pending promise
continuations to expose dependent reads before filling free slots with unrelated
speculation. The bulk operation containing the selected key admits other queued
keys for that resource up to its batch-size limit.

The compiler derives advisory paths from extracted plans, including guarded
reads, helper results, component companions, aliases, and module boundaries.
Recursive plans are condensed into graph components; scoring is finite. These
hints cannot authorize speculation, remove a guard, or change consumption/error
order. The graph describes possible work at source sites, rather than precise
runtime instances or guaranteed wall-clock critical paths.

Hosts can supply historical estimates for the labels on the selected path:

```js
createServerPreloadRequest({
  maxConcurrent: 4,
  scheduling: 'critical-path', // 'fifo' retains FIFO within each queue
  estimateDurationMs: label => previousDurations.get(label) ?? 1,
});
```

Absent estimates, each read has unit cost. Invalid estimates or exceptions fall
back to unit cost. The compiler selects its representative path by dependency
depth; runtime estimates weight that path. This is a scheduling heuristic, not a
claim of globally optimal scheduling across all branches. Capture events and
compare policies on the actual workload.

## Waterfall lens

`ServerPreloadGraph` compiler events and `compileServerPreloadGraph` results
expose dependency nodes/edges. Each compiled module carries its `dependencyGraph`
and source-located `diagnostics`; the graph result also carries the combined
`dependencyGraph`. The esbuild adapter's async `onAnalysis(graph)` callback runs
once after each successful build, including dynamically loaded entries and fresh
rebuild metadata.

Record one request with `createServerPreloadTrace({maxEvents: 10000})` from the
server runtime and pass its `onEvent` to the request owner. `snapshot()` returns
a serializable, bounded trace. Task IDs distinguish reads at the same source
site; operation IDs identify shared backend batches. Events include priorities,
critical-path labels, batch sizes, queue counts and timings. Recording retains
neither resource keys nor result values. A recorder must belong to one request.

Render an offline report in tooling with the compiler export:

```js
import {writeFile} from 'node:fs/promises';
import {renderServerPreloadLens} from 'babel-plugin-react-compiler';

await writeFile('preloads.html', renderServerPreloadLens({
  graph: analysis.dependencyGraph,
  diagnostics: [...analysis.modules.values()].flatMap(m => m.diagnostics ?? []),
  trace: trace.snapshot(),
  sources: originalSourcesByModuleId, // optional source excerpts
}));
```

The report provides an operation timeline, source-site dependency inspector,
retained-boundary reasons, source excerpts, and filtering. Compiler analysis alone
also works without a runtime trace. Reports include their data and need no
external services or JavaScript dependencies. A retained unknown call is an
investigation target, not a suggestion to assert safety without evidence.

Generate a real Flight demo locally after building the compiler/runtime:

```sh
node --conditions=react-server packages/babel-plugin-react-compiler/scripts/demo-server-preload-lens.cjs /tmp/react-server-preload-lens.html
```

The demo writes HTML and JSON, verifies twenty author reads share one bulk
operation, and includes an unknown audit call as a retained ordering boundary.

The Node-only esbuild adapter has its own `babel-plugin-react-compiler/esbuild`
entrypoint. The graph driver is available from
`babel-plugin-react-compiler/server`. Both keep build tooling separate from the
browser-compatible compiler entrypoint used by the playground.

## Feature switches and measured comparison

The compiler and request runtime accept the same partial `features` profile:

```js
const features = {
  preloading: true,     // automatic render-time plans
  batching: true,       // bulk operations instead of one operation per key
  criticalPath: true,   // queued speculation ranking; otherwise FIFO
  routeManifests: true, // before-render plans, independently of render preloading
  deferAwait: true,     // opt-in consumption relocation
  lens: true,           // runtime event recording
};

// Build-time availability and generated-code choices:
serverPreloadsEsbuildPlugin({resources, routes, preloads: {features}});
// Per-request behavior; these switches can also disable emitted capabilities:
createServerPreloadRequest({features, maxConcurrent: 2});
```

Defaults enable render preloading, batching, critical paths and optional lens
recording. Route manifests and await relocation default **off**. Runtime switches
cannot enable code that the build did not emit. A build with all capabilities
available can use different immutable profiles for different requests; there is
no process-global flag or cache shared between profiles.

Turning render preloads off suppresses speculative render plans, not demanded
reads or their deduplication. Route plans have a separate switch and can operate
with render preloads off. Turning batching off dispatches the same per-key API as
individual operations, preserving results, cache identity and errors. Turning
critical paths off selects FIFO, with demand always ahead of speculation.
Turning lens recording off suppresses runtime events even if an event callback
was supplied; dependency analysis can still serve the scheduler/build tools.

The runnable comparison builds and measures **all 64 combinations**, after one
unmeasured warmup per profile. It uses real Flight rendering, explicit backend
operation counters, a common concurrency cap, identical distinct resource keys,
and median/range timings from three samples per profile. Every profile pays the
same 30 ms of independent router work, so pre-render overlap is not free time
hidden outside the measurements. Its interactive checkboxes select measured
profiles; missing combinations are never simulated or interpolated. Savings can
interact and are not additive.

```sh
node --conditions=react-server packages/babel-plugin-react-compiler/scripts/compare-server-preload-features.cjs 3 /tmp/react-preload-features.html
```

The command writes standalone HTML and the underlying JSON. Lens-enabled
profiles include the representative request's source/dependency/timeline report.
`renderServerPreloadComparison(rows)` is exported from the compiler's `/server`
entrypoint for other measurement harnesses.

## Route preload manifests

Configure routes in the esbuild adapter alongside resource contracts:

```js
serverPreloadsEsbuildPlugin({
  resources,
  routes: [{id: 'product', source: './src/ProductPage.tsx', exportName: 'Page'}],
  preloads: {features: {routeManifests: true}},
});
```

The graph result exposes a serializable `manifest` with route IDs, canonical
module IDs, companion exports and parameter names. The adapter supplies a virtual
ES module named `react:server-preload-manifest` that imports the actual generated
companions. Other bundlers can use `emitServerPreloadManifestModule`.

A router can call that manifest **after authorization/context setup**, before
rendering, in the same explicit owner used by the subsequent render:

```js
import manifest from 'react:server-preload-manifest';
import {createServerPreloadRequest} from 'react-compiler-runtime/server';

const owner = createServerPreloadRequest({
  features: {routeManifests: true},
  signal: requestAbortSignal,
});
owner.run(() => manifest.preload('product', {id}));
await independentRouterWork();
owner.run(() => startRenderer());
// Close owner on response completion/abort, as with ordinary preload requests.
```

Preloading is nonblocking and speculative; it does not render components or
surface errors before their original consumers. Route parameters must be plain
primitive data, without getters. A manifest caches no request results itself;
resource/plan state remains in the explicit owner. Requests cannot reuse one
another's results. Calls outside an explicit owner are rejected, and aborted or
disabled owners do not start route work.

React's render cache does not provide deduplication before a render has begun.
Therefore manifest generation verifies that all reachable preloaded resource
sites have scheduler-managed original consumers. Direct `await resource(key)`
forms are supported; a raw `return resource(key)` in a reachable plan is rejected
with a diagnostic instead of risking a duplicate backend read during rendering.
Aliases and barrels retain their originating plan identities. Excluded/client/
action modules cannot advertise route companions. This contract allows a safe
prefix before an unknown-effect barrier, never crossing that barrier.

## Explicit deferred consumption

Preloading preserves original consumption. A separate, deliberate semantic
opt-in can let an existing Suspense boundary own the pending read instead:

```jsx
async function Page({id}) {
  'use defer to suspense';
  const reviews = await getReviews(id);
  return <>
    <h1>Product</h1>
    <Suspense fallback={<p>Loading reviews</p>}>
      <Reviews reviews={reviews}/>
    </Suspense>
  </>;
}
```

With build/request `features.deferAwait` enabled, the compiler starts the same
read at its original site, passes its private pending task to an extracted async
wrapper under that Suspense boundary, and consumes its value before rendering
`Reviews`. The parent shell can stream while the read remains pending. When the
request switch is off, a generated branch awaits in the original parent and
returns the original child element. No wrapper replaces the disabled child.

The directive explicitly permits **earlier parent/sibling rendering and delivery
of loading/errors at the selected Suspense boundary**. This is not the ordinary
preload pass's unchanged-reveal/error-order guarantee. The opted-in function must
be used as a React component, with pure rendering; known imperative invocations
are rejected. No user catch/finally region is crossed. Failures retain their
original error object and are observed immediately while pending; the renderer
receives them from the selected wrapper when consumed.

The first supported form is intentionally proof-limited: one tail `const` await
of a trusted resource, followed immediately by a pure JSX return; the value has
one direct prop use on a stable module-level component. The target must be an
unconditional child below an imported React Suspense, through only transparent
containers/intrinsic elements. Props and resource arguments must have pure
literal/constant evaluation. Conditional/opaque ancestry, fallback-only uses,
getters/calls/spreads, keys/refs, JSX children on the target, multiple uses and
non-tail effects are retained with reasons. Analysis/noEmit never emits deferred
work. Authorization and other earlier effects stay before the read.


The core deferred output is equivalent to:

```jsx
const deferred = shouldDeferAwait();
const task = read(getReviews, [id]);
if (deferred) {
  return <>
    <h1>Product</h1>
    <Suspense fallback={<p>Loading reviews</p>}>
      <DeferredReviews pending={task}/>
    </Suspense>
  </>;
}
const reviews = (await task).value;
return <>
  <h1>Product</h1>
  <Suspense fallback={<p>Loading reviews</p>}>
    <Reviews reviews={reviews}/>
  </Suspense>
</>;

async function DeferredReviews({pending}) {
  const reviews = (await pending).value;
  return <Reviews reviews={reviews}/>;
}
```

Import bindings used as other prop values are retained because their live export
could change while the read is pending. Earlier lexical values and parameter
bindings may be forwarded by identity. A trace's legacy `consumed` event denotes
registration of a demanded read, not the later instant at which its awaited
value is delivered.

## Scenarios with large optimization opportunities

Run from `compiler/` after building the compiler and runtime:

```sh
node --conditions=react-server packages/babel-plugin-react-compiler/scripts/massive-server-preload-scenarios.cjs 3 /tmp/react-massive-preloads.html
```

This builds and renders four source scenarios through real Flight in four modes:
baseline, compiler-only, batching-only, and compiler plus batching. The standalone
report lets you select the scenario and switches, inspect measured median/range
and native operation counts, and compare original/resource/generated source.
The adjacent JSON retains individual runs and batch sizes.

- **32 dashboard metrics:** independent awaits in one page. Compiler plans expose
  all keys before original consumption; bulk loading combines the independent
  keys. Batching by itself cannot anticipate future sequential calls.
- **240 people:** reads spread across sibling component instances. React already
  exposes sibling work concurrently. Batching removes backend round trips; the
  compiler should not claim credit for concurrency React already provides.
- **120 orders across three component levels:** order IDs unlock customer IDs,
  which unlock credit reads. Independent keys batch within their phase; true
  data dependencies remain. Every backend invocation asserts that its prerequisite
  data has completed, not just started.
- **20 dependent reads (control):** each key comes from the previous result.
  All modes must perform 20 native operations. No operation reduction is possible.

These are controlled synthetic round-trip-dominated backends: 8 ms per operation
plus 0.025 ms per returned key, with an identical eight-operation concurrency cap,
80-key group limit and speculative budgets across modes. Each resource exposes
a native bulk endpoint; this measures scheduling and dispatch, not database
query planning or SQL generation. Production bulk cost, payloads, rate limits and
backend saturation can change or eliminate the measured speedups.

Each mode gets a discarded warmup and the requested measured samples. Every
render validates all final payload markers, the exact resource/key set, no
repeated I/O for a key, completed dependencies, bounded concurrency/batch sizes,
and no remaining native work at response completion. Structural operation counts
have assertions; timing speedups have no pass threshold. The control makes
unsupported speedup claims visible rather than hiding them.

## Independent app coverage audit

`compiler/examples/server-apps/` contains three independently authored RSC apps,
original-source fingerprints, nine fixtures, and separate manual preload probes.
The author agents were not given the optimization objective or scheduling
patterns. A fourth reviewer independently assessed the fetching schedules.
See the [audit protocol](../../../../examples/server-apps/README.md) and
[findings](../../../../examples/server-apps/AUDIT.md).

Run from `compiler/`:

```sh
node --conditions=react-server packages/babel-plugin-react-compiler/scripts/audit-independent-server-apps.cjs 5 /tmp/react-independent-apps.html
```

The harness compares original source, unregistered compilation, reviewed cached
read contracts, separate manual guarded preloads, and a clearly labeled
explicit-prop diagnostic copy. The original author files remain unchanged.
Every measured Flight result is decoded into complete static HTML and compared
with the original, including native key/result hashes and missing/empty/cancelled
fixtures. All modes share the same synthetic I/O and operation cap. No native
bulk endpoint is added, so this audit tests scheduling rather than batching.

The initial corpus exposes a real gap: the dashboard's independent activity and
owner reads remain behind parent summary work even with reviewed contracts.
Manual preloads reduce its five native dependency layers to three. Defaulted
component props, mapped concurrent reads, record-prop provenance and rich JSX
are current extraction limits. Removing prop defaults alone in the diagnostic
copy exposes more reads but does not remove that waterfall. Bookshop and travel
already overlap available work close to their native dependency bounds.

These findings bound the prototype's practical coverage; the large controlled
scenario gains above do not establish broad application compatibility.
