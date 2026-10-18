# DRAW optimization lab

Compiler follow-up: [single-key Context specialization](COMPILER_KEYS.md) reduces the unchanged app’s confirmed median from 1,571.0 ms to 935.9 ms (40.4% less time), using compiler lowering plus a runtime intrinsic. The original matrix below predates this change.


DRAW's inferred 5,000-event React-logo workload, integrated with this worktree's experimental React runtime and Rust React Compiler. The original recreation and provenance are documented in [RECREATION.md](RECREATION.md); historical commands/results there describe the earlier released-React version, not this matrix.

## Run

From `compiler/apps/draw-benchmark`:

```sh
npm run build
npm start
```

Open <http://127.0.0.1:4180/>. Choose Context or the entity external store, turn the compiler off/on, and select optimization flags. The editor can run warmups/repeated trials for the selected configuration, verify every synchronous commit, and export timings. The dashboard shows generated-code evidence and the saved screening/confirmation results. Use one active benchmark tab at a time.

This app intentionally reuses the worktree's existing dependencies rather than installing different compiler/runtime versions:

- Babel, preset-react and esbuild from `compiler/node_modules`.
- The Rust plugin at `compiler/packages/babel-plugin-react-compiler-rust/dist/index.js`, with native addon `native/index.node`.
- Experimental React, ReactDOM and Scheduler in `build/node_modules`.
- Playwright from sibling `compiler/apps/todomvc-benchmark`.

If these are missing, follow the existing TodoMVC benchmark's build prerequisites. The build manifest records the source hash, branch/commit, native addon hash, ReactDOM client hash, and compiler-runtime hash. It uses the existing compiled artifacts; if you change compiler/runtime source, rebuild those artifacts first, then rebuild/reverify this app. No core React/compiler source changes are required by this integration.

## What the matrix measures

The same `src/Editor.jsx`, state adapters and `src/trace.js` drive every case. All use this checkout's local experimental React runtime, including compiler-off controls. The Rust plugin is disabled or receives the listed environment flags; this does not rebuild React with runtime feature flags individually removed. Runtime support for the experiments remains enabled across every case.

Exhaustive valid combinations are generated for:

- `enableComponentInlining`
- `enableJsxBlocks`
- `enableListItemMemoization`
- `enableIncrementalListMapping` (requires list memoization)
- `enableContextSelectors`
- `enableSelectorReads` (requires selectors)
- `enableUpdateSlicing` (requires selectors)
- `enableStaticIslands`

There are 120 valid flag combinations plus compiler-off for each architecture: **242 configurations**. The builder hashes the exact generated editor and adapter modules and groups byte-identical outputs; this build produced **74 distinct outputs**. Every alias and its representative are retained in `dist/manifest.json`. Each representative includes generated source files for inspection. Compiler errors are recorded and not silently treated as successful optimization.

`enableStateVariables` changes source-language semantics and has no eligible mutable state-variable syntax in this ordinary `useState` editor. A build-time probe verifies its output is unchanged; it is not advertised as an optimization here. Static islands are included, but this workload mounts on the client and updates DOM; it does not measure their intended server-hydration benefit.

Context keeps the giant map in one React state value; shapes take IDs and read their own records. The external store intentionally changes the architecture to entity-specific subscriptions and immutable record snapshots via `useSyncExternalStore`. Compare flags within one architecture to isolate compiler effects; cross-architecture rankings include store/data-model effects.

## Correctness gate and timing

```sh
npm test            # model, stable snapshots, equivalent state transitions
npm run build       # compile all configurations and save code/fingerprints
npm run verify      # all distinct outputs, manual editing + 5,000 per-event commits
npm run bench       # screen: 2 warmups, 3 measured trials, rotating order
npm run confirm     # top 5 per architecture + on/off/all-on/list controls: 2 warmups, 9 trials
```

`WARMUPS`, `TRIALS`, `VARIANTS` (comma-separated representative IDs), `HEADED=1`, and `BROWSER_CHANNEL` can customize runs. Default browser: installed Google Chrome. Benchmarks create an ephemeral localhost server. `PORT=4181 npm start` changes the dashboard's server port.

The runner resets outside timing, dispatches real editor button/input events inside one `flushSync` each, and performs all 5,000 actions in one uninterrupted JavaScript task. Every action changes state. No layout reads, awaits, animation frames, mutation observers, or profiler run in that timed interval. Layout/paint occur afterward. State work, event dispatch, React rendering/commits and any GC during the loop count toward the duration. Each run checks final state and DOM outside timing.

Verification checks exactly one committed revision plus affected shape geometry after each action, before continuing; tests manual text editing/selection; confirms no queued microtask ran; compares full state and normalized shape DOM against the compiler-off reference. DOM comparison is semantic rather than exact HTML because compiled blocks may change text separator nodes or style serialization. Broken output never qualifies as a fast result.

The screening run ranks every verified distinct output. Confirmation takes the top five **within each architecture**, plus compiler-on/off, all-flags-on and simple incremental-list controls, in a fresh browser session with more trials. Samples rotate configuration order to distribute drift. Results are medians and interquartile ranges, not a claim of a universal fastest React configuration; near-ties must be treated as noise. The inferred trace and this local branch are the scope of the claim.

## Evidence

Generated files are ignored by Git but kept locally:

- `dist/manifest.json`: every flag combination, equivalence groups, compilation evidence, source/binary hashes and failures.
- `dist/<representative>/*.compiled.js`: exact transformed editor/state source.
- `results/correctness.json`: pass/fail per distinct output, synchronous commit counts and state/DOM hashes.
- `results/screen.json`: screening raw/warmup values, order, median and quartiles.
- `results/confirmation.json`: independent finalist run and metadata.
- `results/progress.json`: last completed step, shown on the dashboard.
- `results/baseline.png`, `results/winner.png`: screenshots.

The trace remains an approximation (999 boxes plus one text label), not Joe Savona's unavailable original DRAW command recording. Related public Fir runtime source is linked in RECREATION.md; no Fir runtime is included here.

Generated-code audit: toggling component inlining produced identical code in all 120 valid pairs; selector reads did so in all 96 valid pairs. These flags have no generated-code effect for this source. Other flags change at least some output.

## Why the Context gain is modest

See [PROFILING.md](PROFILING.md) for separate CPU sampling and exact call counts. Selectors reduce entity renders from 2,502,500 to 5,000, but still perform 2.69 million Fiber begin-work calls and 4.54 million selector comparisons. These diagnostics are not the timed results. Reproduce them after confirmation with `npm run profile`.
