# Compiler specialization of single-key Context reads

This is a compiler optimization on the **unchanged flat DRAW application**.
The previous scoped-list experiment changed the app and was rejected. Its
speedup is not evidence for this change; its active code and controls were removed.

## Confirmed result

On this M2 Max with Chrome 155, three warmups followed by nine rotating-order
trials per build produced:

| Compiler flags | Key specialization | Median | Middle 50% |
| --- | --- | ---: | ---: |
| Lists + Context selectors (20) | Off | 1,571.0 ms | 1,563.6–1,575.5 ms |
| Lists + Context selectors (20) | On | **935.9 ms** | 935.4–949.9 ms |
| All previously effective flags (222) | Off | 1,567.9 ms | 1,553.9–1,573.1 ms |
| All previously effective flags (222) | On | 942.2 ms | 939.0–946.3 ms |

The paired mask-20 comparison takes **40.4% less time (1.68× speedup)**.
Mask 20 plus key specialization has the lowest observed median, although its
small difference from mask 222 is within the observed trial variation.
These confirmation numbers supersede the earlier three-trial screen.
Raw samples and hashes are in `results/key-confirmation.json`.

## Implementation

The Rust `SelectContextReads` pass already proves which Context paths each read
uses. The new `enableContextKeySpecialization` flag, off by default, specializes
exactly one top-level `Entry::Read` into a compiler-runtime intrinsic:

```js
// Source — unchanged:
export function useEntity(id) { return useContext(Database)[id]; }

// Previous generated code, omitting the memo-cache plumbing:
return unstable_useContextPaths(Database, [[0, id]])[id];

// New generated code:
return unstable_useContextKey(Database, id)[id];
```

This removes the nested descriptor and its memo slots. The intrinsic in
`packages/react/src/ReactCompilerRuntime.js` uses the existing reconciler selector
API. It lazily snapshots the selected key from the rendered Context value, reads
that key directly on subsequent values, and caches repeat comparisons against the
same Context value. Its cache belongs to that render's dependency. No new
component boundaries, subscriptions, state containers, or DOM code are introduced.

Only the compiler pass and its compiler-runtime helper implement the speedup.
**The React reconciler is unchanged**, including its production binary hash.
Other runtime-only probes were not promoted into this implementation.

## Correctness boundaries

The specialization applies only to a direct Context call where the existing
analysis proves a single top-level read. Static string/numeric keys and available
dynamic keys qualify. Nested paths, multiple selected keys, equality selections,
whole-value escapes, and custom-hook selection retain the existing lowering.
It requires `enableContextSelectors` and the new compiler runtime (target 19,
client output). There is no application-specific name or trace detection.

As with compiler memoization generally, Context values and render reads must be
immutable/pure. Selection initializes lazily during invalidation, not during
render, so it does not eagerly evaluate a getter behind a render guard. Exceptions
are not cached: the existing reconciler treats them as a change and the component
render determines whether to throw. Comparisons use Object.is, including NaN and
negative zero. A changed dynamic key gets a fresh dependency cache.

## Evidence and measurement

`results/key-manifest.json` records source-file, native compiler, compiler-runtime,
reconciler and bundle hashes. The build asserts:

- The complete app source hash equals the original benchmark's source hash.
- The reconciler binary equals the original control binary.
- With the new flag off, the compiled Editor and Context adapter are byte-identical
  to the original compiler outputs.
- With the flag on, the compiler emits the new intrinsic at the useEntity read.
- Every function compiles successfully; silent fallback is rejected.

The measured on/off variants share one newly built compiler runtime. Thus the
experimental helper is present in both builds, and the compiler flag determines
whether generated code uses it. `key-20-*` uses list memoization + Context
selectors; `key-222-*` adds all previously effective compiler flags.

`results/key-confirmation.json` contains three warmups and nine measured trials
per variant in a fresh Chrome process, with rotating execution order, raw timings,
quartiles and bundle hashes. Timed bundles are minified production builds without
profiling/counters. The trace, UI events, 5,000 flushSync calls, reducer and giant
state map are unchanged. Final checks run outside the timing interval.

`results/key-correctness.json` verifies the original control plus four new builds:
25,000 individual synchronous commits, identical final state and shape DOM,
no microtask yield, edits switching between earlier entities, text editing, and
clear/remount. These are still measurements of the documented recreation, not the
unavailable original DRAW trace.

Tests:

- Chrome tracing reports zero Layout, Paint or UpdateLayoutTree events during
  the synchronous diagnostic loop in both specialized builds. Tracing is separate
  from timing trials. The dashboard preview, manual edits and final DOM pass.

- 146 Context tests pass in each of development and production. Five new tests
  cover dynamic keys, Object.is behavior, cached reads, exceptions/guards,
  nullish Contexts, symbol keys, and interrupted transitions.
- 17 compiler fixtures pass through snap's actual transformFixture/report worker,
  including three new snapshots for specialization, conservative fallback and
  flag-off behavior. The wrapper CLI requires global yarn, unavailable here;
  `scripts/key-fixtures.cjs` runs the built worker directly instead.
- `compiler/scripts/test-babel-ast.sh` passes: 1,789 AST round trips, 1,790 scope
  information round trips, and 1,774 rename checks (12 skipped). The fixture parser
  also reports 31 parse errors; the script's tests pass on its accepted inputs.

## Run

From `compiler/apps/draw-benchmark`:

```sh
npm start
# http://127.0.0.1:4180 — use the compiler key-specialization comparison
npm run build:keys:compiler
npm run build:keys:runtime
npm run build:keys
npm run test:keys:compiler
npm run verify:keys
npm run confirm:keys
npm run test:keys:layout
npm run test:keys:dashboard
```

The scripts require the existing local compiler dependencies and runtime packages
listed in README.md. The compiler flag is experimental and opt-in. Only relevant
regression suites were run, not the full React/compiler test matrix.
