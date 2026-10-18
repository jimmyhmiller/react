# Why the Context improvement is modest

The confirmed Context result is 1495.4 ms with list memoization + context selectors, versus 1582.6 ms with compiler only: 5.5% less time. Both are much faster than compiler-off (2604.0 ms); the best Context configuration takes 42.6% less time than compiler-off.

The experiments are eliminating component work, but considerable work remains in the reconciler. Two **separate diagnostic executions**, not used as benchmark timings, establish this.

## Exact call counts

Instrumented copies of the production bundles count function entries during one reset + the 5,000-action trace. The subsequent correctness replay is excluded from these counters. Counts do not represent milliseconds.

| Function | Compiler only (`context-0`) | Lists + selectors (`context-20`) |
| --- | ---: | ---: |
| `Entity` | 2,502,500 | 5,000 |
| `updateFunctionComponent` | 2,532,505 | 27,005 |
| `beginWork` | 5,210,031 | 2,688,531 |
| `createWorkInProgress` | 5,208,010 | 2,686,510 |
| `attemptEarlyBailoutIfNoScheduledUpdate` | 2,601,513 | 2,609,513 |
| `checkIfContextChanged` | 2,027,004 | 2,526,504 |
| `selectedValuesChanged` | 0 | 4,541,506 |
| reducer | 5,001 | 5,001 |

Selectors reduce entity render calls **500.5×**, but the run still enters millions of Fibers and checks millions of selections. It does not turn each edit into constant work. The 5,001 reducer calls include the reset.

## CPU sampling

A separate non-minified production diagnostic build, after warmup, was sampled at 250 microseconds. Approximate self-time attribution:

- Compiler only: `Entity` 19.9%, `updateFunctionComponent` 18.9%, reducer 13.3%.
- Lists + selectors: `attemptEarlyBailoutIfNoScheduledUpdate` 25.7%, `renderRootSync` 25.2%, reducer 13.7%, `beginWork` 5.8%.

The CPU profile supports the call counts: the hot work changes from component execution to traversal/bailout bookkeeping. Map copying contributes, but is not the main explanation for the limited incremental gain. CPU sampling is approximate, profiling/non-minification changes optimization and overhead, and JIT inlining can affect attribution. These percentages must not be multiplied by the separate benchmark medians as exact costs.

## Likely next targets, not implemented here

1. **Reuse selection comparisons when valid.** `selectedValuesChanged` is reached during Context propagation and through `checkIfContextChanged`, and runs 4.54 million times in this trace. Investigate repeated comparisons for the same dependency and provider value. Any cache must respect provider identity, committed vs work-in-progress snapshots, render lanes, interrupted renders and concurrent updates.
2. **Skip clean siblings rather than visiting each to bail out.** The current `bailoutOnAlreadyFinishedWork` can clone the child Fiber list and continue when the subtree has pending work. A changed leaf in this flat 1,000-entity list still leaves millions of Fiber visits. Reducing this traversal needs reconciler work; a compiler flag alone does not remove it.
3. **Reduce component boundaries where possible.** Inlining changes none of this app's generated output. The entity reads hooks, so the existing inlining experiment does not flatten this hot boundary. Additional support would be a separate compiler/runtime experiment.

Sources to inspect in this checkout: `packages/react-reconciler/src/ReactFiberBeginWork.js` (`bailoutOnAlreadyFinishedWork`, `attemptEarlyBailoutIfNoScheduledUpdate`), `ReactFiberNewContext.js` (`checkIfContextChanged`, `selectedValuesChanged`, propagation), and `ReactChildFiber.js` (`cloneChildFibers`). These are candidate directions, not measured fixes or claims about what is safe to change.

## Evidence and reproduction

```sh
npm run profile
```

Requires completed builds and confirmation results. This produces separate files under `results/profile-*` and `results/counts-*`; it does not change `dist` or the measured bundles. Raw Chrome profiles can be loaded in DevTools Performance.

- `results/profile-summary.json`: sampled self/inclusive attribution for compiler-only and winning Context/store cases.
- `results/profile-*/cpu.cpuprofile`: raw CPU profiles.
- `results/work-counts.json`: exact counters and the functions instrumented.
- `results/confirmation.json`: independent, uninstrumented nine-trial performance results.
