# Independent app audit results

Three neutral app-author tasks, frozen sources, and a separate independent source review. No compiler/runtime production code was changed during this audit. See README.md for the full protocol.

Final run: 9 fixtures × 5 modes × (1 warmup + 5 samples) = **270 actual Flight renders**, with **225 measured payloads decoded and compared as complete static HTML**. Native key/result hashes, cache deduplication and concurrency limits match the original in every measured mode. SHA-256 fingerprints match before/after.

All native reads have controlled 20 ms latency and a common cap of eight. Values below are measured medians in milliseconds; they are not production predictions.

| Default app | Original | Compiler, contracts | Manual probe | Diagnostic explicit props | Native requests |
| --- | ---: | ---: | ---: | ---: | ---: |
| bookshop | 64.9 | 65.1 | 64.6 | 67.8 | 12 in every mode |
| team-dashboard | 110.1 | 111.6 | 66.9 | 110.7 | 11 in every mode |
| travel | 90.3 | 89.3 | 88.0 | 89.9 | 17 in every mode |

## What the results mean

- **Bookshop:** already near the three-layer dependency bound. Sibling server components and Promise.all overlap available reads. Current extraction is limited, but the independent manual schedule does not remove a material I/O layer.
- **Travel:** already near the four-layer bound for the confirmed trip. Cached totals reuse day/activity reads. Child components and Promise.all overlap the independent work. Bulk APIs would be a different backend design, not a missed scheduling opportunity.
- **Team dashboard:** a real current compiler miss. Activity/billing have organization keys but wait for projects and all summaries. Owners have project keys but wait for summary consumption. The manual probe reduces the successful schedule from five native layers to three, preserving original rendering and consumption sites. The empty-team fixture also improves from three layers to two.

## Concrete compiler coverage gaps

1. **Literal defaults in destructured component props.** All three Page functions use them. ServerPreloadPlans currently requires ObjectProperty.value to be an Identifier (source around lines 360–385), so AssignmentPattern props invalidate the component plan. The separately labeled diagnostic removes defaults only for explicit-prop fixtures: it increases extracted sites but does not close the dashboard gap.
2. **Promise.all over immutable-array map callbacks.** team-dashboard/Page.jsx:48 and bookshop/Page.jsx:17 are ordinary concurrent reads that current plans treat as opaque. Supporting them requires callback effect analysis, immutable inputs and native promise semantics, not guessing that every method named map is pure.
3. **Immutable record props through mapped children.** ProjectCard awaits readTaskSummary(project.id), and ActivityItem awaits readPerson(item.actorId). The compiler lacks the provenance proof that those record props come from declared immutable result arrays.
4. **Rich JSX assembly blocks child plans.** Object spreads, formatting calls and nested map JSX conservatively retain the whole expression. The team miss includes activity/billing and Owner reads behind unrelated parent awaits. Improving this requires sound effect/provenance analysis; dropping the barrier wholesale would be unsafe.
5. **Cached composite readers.** travel/data.js:getTripTotals composes cached leaf reads; it is not a native endpoint and was not registered as one. Supporting such helpers should derive their read dependency summary while preserving their cache and consumer identity.

No-contract compilation yields zero eligible reads, as designed. The genuine miss remains after explicitly reviewing/registering safe leaf reads. No bulk endpoint, batch callback, data amplification, or rewritten authored component was used to create the measured result.

Manual probes were independently written after authors finished, and are separate files in probes/. Their error observation leaves original consumption sites intact; the measured corpus checks success/missing/empty/cancelled fixtures, not arbitrary injected failures. Speculative contracts permit unused reads on later failures.

Interactive results: /tmp/react-independent-apps.html; individual runs, timelines, generated source, diagnostics and fingerprints: /tmp/react-independent-apps.json.

Reproduce from compiler/:

```sh
node --conditions=react-server packages/babel-plugin-react-compiler/scripts/audit-independent-server-apps.cjs 5 /tmp/react-independent-apps.html
```

## Follow-up: automatic proof propagation

Checkpoint `ec7d45edaa` preserves the initial implementation and audit above.
The follow-up compiler handles literal prop defaults, immutable native collection
callbacks and Promise.all, record props through components/imports/barrels, readonly
JSX formatting and spreads, and cached composite helper summaries. Independent
child groups use their own dependency points. Authored app files remain unchanged.

The five-sample follow-up audit (`/tmp/react-independent-apps-improved.html`, with
JSON alongside) measured the active dashboard at **107 ms original / 66 ms
compiled / 67 ms manual**, with 11 identical native operations. The empty dashboard
measured 64 / 44 / 43 ms with three operations. Missing roots still perform one
operation. Bookshop (~64 ms) and travel (~86 ms) remain at the manual probe's
existing dependency depth; neither is evidence of a removable missed I/O layer.

All 225 measured Flight renders matched complete decoded host HTML and exact
native keys/results, with request caps checked; 45 additional warmups ran. The
harness now also asserts event ordering: activity and owner operations start
before task summaries finish. This is a structural scheduling regression, not a
wall-clock threshold. Original author fingerprints are verified before and after.
Native batching remains disabled in this audit because these apps offer no bulk
backend. Separate large scenarios validate explicit bulk endpoints.
