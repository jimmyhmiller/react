> REJECTED EXPERIMENT: this changed the app and does not satisfy the compiler/runtime-only requirement. The 1.91× result must not be counted as an optimization of the unchanged benchmark. Active code and dashboard controls have been removed; historical results below are retained for transparency.

# Scoped Context and provider pruning

An opt-in optimization for the DRAW recreation on `speculative-optimizations`.
The original flat Context benchmark and compiler matrix remain unchanged.

## Confirmed result

**1502.3 → 787.9 ms: 1.91× speedup, 47.6% less time** than the previous best flat Context configuration.

| Configuration | Median ms | p25–p75 ms |
|---|---:|---:|
| Previous best flat Context | 1502.3 | 1486.3–1530.0 |
| Flat Context + runtime pruning | 1511.4 | 1507.6–1524.4 |
| Scoped Context + original runtime | 1243.8 | 1231.5–1263.2 |
| Scoped Context + pruning | 787.9 | 786.9–794.0 |
| Scoped Context + pruning + all effective flags | 788.2 | 783.5–796.8 |
| External store reference (different state architecture) | 460.2 | 455.3–461.0 |

The broader compiler flag combination is effectively tied. The simpler lists + Context selectors configuration is the default. Runtime pruning alone does not speed up the flat tree. The external store remains faster, but the scoped result retains Context and the giant immutable state map.

## What changed

1. `packages/react-reconciler/src/ReactFiberNewContext.js` stops a propagation
   walk at a nested provider of the **same** Context when exactly one Context
   is being propagated. That provider shadows the ancestor value. Its own
   updates still propagate normally. For multiple changed Contexts, the
   existing traversal remains in use so unrelated changes are not suppressed.
2. `enableContextProviderPruning` gates that change. It is enabled in the
   experimental OSS runtime and disabled in the other feature-flag forks.
3. The opt-in DRAW build replaces only the artboard's flat entity mapping
   with `ScopedList` (`src/scoped-list.jsx`). Sixteen adjacent entities share a
   provider boundary. The boundary selects those entity records, retaining its
   prior provider snapshot and children when they have not changed. The entity
   component, editor controls, reducer, state provider, and trace are shared.

The application still has **one immutable map in one useState value**, passed
through Context. Every action still shallow-copies the map and synchronously
commits via the same UI event and `flushSync` loop. There are no per-entity
stores, subscription callbacks, direct DOM patches, batching, or skipped actions.

This is **not a drop-in runtime speedup for a flat Context tree**. The grouping
is an explicit app transformation with manual memoization inside its helper.
It has not been added as an automatic Rust compiler pass. Automatically applying
it would require proving which Context records each grouped subtree may read.

## Scope and limitations

- A partition's descendants may read only its listed entity IDs from Database.
  The retained map is a snapshot: unrelated records in it may be old. Global
  document/clock consumers stay outside the partition. Other Contexts, including
  the dispatch Context, retain their ordinary behavior.
- The DRAW trace appends and edits entities. A keyed entity moved across a
  partition boundary would remount; this helper does not promise flat-list
  component-state preservation across arbitrary reorder operations.
- This is an experimental branch optimization, not an upstream-ready release.
  The tests cover relevant Context semantics; they are not the full React suite.
- The original talk's trace is unavailable. These are measurements of the
  documented recreation, not numbers for the original DRAW application.

## Evidence

`results/scoped-confirmation.json` contains three warmups and nine measured
trials per configuration, rotating execution order in a fresh Chrome process.
All measured bundles are minified production builds with no counters or CPU
profiling. Final state and DOM checks run after each timed loop. Raw durations,
quartiles, browser/CPU, bundle hashes, original build provenance, runtime hashes,
and the reconciler/helper source hashes are recorded.

The on/off runtimes are real Rollup builds of the same source tree with the new
feature flag toggled. The build command was tested to reproduce **both** recorded
runtime hashes. The final bundles do not use the exploratory runtime text patch.

`results/scoped-correctness.json` verifies all eleven new configurations plus
the prior best Context build: 60,000 individually checked synchronous commits,
identical final state and shape DOM, no microtask yield, edits to entities in
several different partitions, text editing, and clear/remount behavior.

A separate Chrome tracing run found no Layout, Paint, or UpdateLayoutTree events inside the synchronous interval (`results/layout-check-scoped.json`). The dashboard selector, manual editing, and final logo/state were also checked (`results/scoped-dashboard-test.json`).

Core Context regression suites pass in development and production: **144 tests
in each mode**. New cases cover provider shadowing, inner-provider and local
state updates, multiple/unrelated Contexts, unmounting, and transition interruption.
One existing assertion was updated to expect the now-eliminated unnecessary
inner-consumer render when the new flag is enabled.

Separate instrumented runs (`results/scoped-work-counts.json`) explain the gain:

| Work during reset + 5,000-action trace | Flat Context, previous best | Scoped, old runtime | Scoped + pruning |
|---|---:|---:|---:|
| beginWork calls | 2,688,531 | 409,600 | 409,600 |
| Selector comparisons | 4,541,506 | 2,697,798 | 237,638 |
| Entity renders | 5,000 | 12,468 | 12,468 |

Grouping removes roughly 85% of Fiber visits. Pruning prevents the outer value
from being compared with consumers behind unchanged providers, eliminating
roughly 95% of selector comparisons versus the flat tree. Some extra entity
renders occur when groups grow; the net traversal reduction is much larger.
Instrumented durations are not included in timing results.

## Run

From `compiler/apps/draw-benchmark`:

```sh
npm start
# http://127.0.0.1:4180 — use the scoped Context comparison selector
```

Reproduce the builds and checks (requires the existing local React/Rust compiler
and dependencies described in README.md):

```sh
npm run build:scoped:runtime
npm run build:scoped
npm run verify:scoped
npm run confirm:scoped
npm run counts:scoped
```

The runtime builder temporarily toggles the new flag for the control build and
restores the exact flag source in a finally block. It then builds the enabled
runtime. Run it without simultaneous edits to that flag file. It uses
`--unsafe-partial` to retain the other local runtime packages.

The control build must match the original matrix runtime hash. If it does not,
rebuild and verify the original matrix against a deliberately chosen matching
control before making a new comparison; do not mix unrelated runtime changes.

Core regression commands, from the React worktree root:

```sh
node scripts/jest/jest-cli.js ReactContext ReactNewContext --runInBand
node scripts/jest/jest-cli.js ReactContext ReactNewContext --runInBand --prod
```
