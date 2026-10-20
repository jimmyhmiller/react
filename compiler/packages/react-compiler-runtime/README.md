# react-compiler-runtime

Backwards compatible shim for runtime APIs used by React Compiler. Primarily meant for React versions prior to 19, but it will also work on > 19.

See also https://github.com/reactwg/react-compiler/discussions/6.

## Server preload runtime

The separate `react-compiler-runtime/server` entrypoint supports generated Server
Component preload plans on Node. It requires React's server cache APIs. Importing
the client entrypoint does not load Node async hooks or the server scheduler.

Normally the scheduler belongs to React's request cache and follows
`cacheSignal`. A streaming host can explicitly own its lifetime, which is also
required on older React versions without `cacheSignal`:

```js
import {createServerPreloadRequest} from 'react-compiler-runtime/server';

const request = createServerPreloadRequest({
  maxConcurrent: 8,
  maxQueued: 128,
  maxPlanSteps: 1024,
  signal: incomingAbortSignal,
  onEvent(event) { /* labeled start, consumption, queue and timing events */ },
});
request.run(() => startRenderer());
response.once('finish', () => request.close());
response.once('close', () => request.close());
```

Close the scope on response completion/abort, not merely when a parent shell has
been produced. `runWithServerPreloads({signal, ...options}, callback)` joins a
host-managed lifetime. `getServerPreloadSignal()` lets a resource implementation
use its owner's signal for its own I/O.

Reads are shared per request by function identity and primitive key tuples.
Demanded work promotes queued speculation. Queue/plan budgets bound speculative
retention and fan-out; a dropped preload does not poison a later demand. Closing
a scope rejects queued/observed tasks without independently aborting another
consumer's shared I/O. Resource implementations own that I/O's cancellation.

`read`, `plan`, `launch`, `fork`, `each`, and `isCancelled` are the generated-code
protocol. `read` returns a promise of a private `{value}` envelope, not a second
promise assimilating the unknown resource value. The compiler unwraps it at the
original await. This preserves then-accessor behavior as well as result identity
and await/error order. All speculative rejections have immediate observers.

The compiler's resource contracts and graph integration are documented in
`babel-plugin-react-compiler/docs/passes/56-serverPreloads.md` in this repository.

`createBatchedResource(batch, {maxBatchSize: 100})` creates a stable per-key
resource whose admitted key tuples collect into one bulk operation per dispatch.
The callback returns one `{status: 'fulfilled', value}` or
`{status: 'rejected', reason}` envelope per key in order. It must return ordinary
data and perform the underlying bulk I/O directly. The scheduler caches direct
and compiler-generated calls together within the request and counts a batch as
one concurrent operation. Batch results, errors, and context cannot cross request
boundaries. The compiler documentation contains the full contract and examples.

`createServerPreloadTrace({maxEvents: 10000})` returns `onEvent` and `snapshot()`
for recording one request without retaining keys/results. The snapshot can be
combined with compiler analysis in `renderServerPreloadLens` to produce an offline
HTML timeline and dependency inspector. Recording is opt-in and bounded.

The default `scheduling: 'critical-path'` policy ranks queued speculative reads
using compiler-provided downstream paths; demand always comes first. Hosts may
supply `estimateDurationMs(label)` or select `scheduling: 'fifo'` for comparison.
Hints affect queue selection only; guards, error order and request ownership
continue to follow the resource contract and generated original consumers.

Requests accept a `features` profile with independent booleans for `preloading`,
`batching`, `criticalPath`, `routeManifests`, `deferAwait`, and `lens`. The first
three and optional lens recording default on; route/deferred features default
off. Pass the same profile to the compiler's `preloads.features` to control
emitted capabilities. A request can disable any capability already emitted by
the build. Render and route preloading are independent. With batching off the
same API performs one operation per distinct key; cache identity stays intact.

Generated route manifests use `createRoutePreloadManifest`. Call their `preload`
method inside an explicit request owner's `run`, after establishing authorized
request context, and reuse that owner for the later render. Parameters must be
plain primitive data without getters. The manifest holds no request results.
The compiler rejects manifests with unmanaged original consumers that could
otherwise bypass deduplication before React's render cache exists.

`shouldDeferAwait()` is the compiler protocol for source-opted-in deferred props.
It defaults false; enabling it permits the selected existing Suspense boundary
to consume the pending read while the parent shell streams. The generated
false branch retains the parent's original await and original child element.
This is a deliberate reveal/error-timing change, separate from ordinary preload
semantics. User catch/finally regions are not crossed. See the compiler pass
reference for the exact supported forms and contracts.

### Source-declared server reads

```ts
import {createServerRead} from 'react-compiler-runtime/server';

export const getProduct = createServerRead(async (id: string) => {
  return db.product.findUnique({where: {id}});
});

// In an active request:
getProduct.preload('123');
const product = await getProduct('123');
```

This experimental API declares a render-safe, speculative read and provides
request-owned deduplication itself. Calls with matching primitive arguments
share a promise, result and error. The compiler discovers stable module-level
factory declarations automatically: no resource list or extra `cache` wrapper
is necessary. `createBatchedResource` declarations are discovered too.

Callbacks must permit early/unused execution, perform no writes or required
per-call effects, and use request-stable context. Keep authorization and
transaction transitions outside them. Do native I/O directly; awaiting another
resource on the same bounded scheduler pool can deadlock. Results are ordinary
data without custom thenables or observable `then` accessors. Optional
`{result: 'immutable-data'}` allows the compiler to inspect immutable results;
without it results stay unknown. Options must be static literals for compilation.

Manual and compiled calls share the same request scheduler. Outside active React
rendering use an explicit request owner, shared with subsequent rendering and
closed at response completion/abort. The `preloading` feature switch disables
manual `.preload()` as well as generated speculation; demanded reads still work.

The design draws from React's historical `react-cache` read/preload resources,
the React working group's built-in cache proposal, modern `cache` preloading,
and DataLoader's request-scoped batching. It is not a standard React API. Full
contracts and source links are in the compiler's
[server preload documentation](../babel-plugin-react-compiler/docs/passes/56-serverPreloads.md).

Batch support uses the same API:

```ts
export const getUser = createServerRead(loadOneUser, {
  maxBatchSize: 100,
  async batch(keys) {
    // Native bulk I/O; one fulfilled/rejected outcome per tuple, in key order.
    return loadManyUsers(keys);
  },
});
```

The compiler exposes independent keys across supported helpers, loops and
component boundaries. Direct calls, manual preloads and generated plans share
one cache. Batch and single callbacks must provide equivalent per-key outcomes.
Turning request `features.batching` off calls `loadOneUser` per key; turning it
on groups keys for `batch`, up to `maxBatchSize` (default 100). Both paths obey
the same backend-operation cap. Per-key failures remain isolated; whole-batch
failures or invalid output reject all participating keys. Callback definitions
are captured once at resource creation.

Keep managed read dependencies outside backend callbacks so the compiler can
schedule them. Factory callbacks that await/preload another managed read on the
same request pool fail with a descriptive error instead of deadlocking. This
check follows asynchronous continuations. External request-owned loaders that
perform their own native I/O remain valid adapters.
