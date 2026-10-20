# Independently authored server apps

Three isolated author agents built these apps from neutral product briefs. They
were asked for ordinary async React Server Components, request-cached readers,
a deterministic read-only backend boundary and multiple rendering fixtures. They
were not told the compiler/optimization objective or given fetching schedules.
Each author worked only in its own directory without seeing this conversation
or the compiler implementation. These are agent-built examples, not third-party
production applications or an unbiased sample of all React apps.

- `bookshop/`: title, author, stores/stock, reviews/reviewers, related books.
- `team-dashboard/`: organization, projects/tasks/owners, activity, optional billing.
- `travel/`: itinerary, days/activities/places, host, weather, travelers and totals.

The five original author files per app are recorded in `author-snapshots.json`.
The audit verifies their SHA-256 fingerprints before and after evaluation.
Original app files are never rewritten to make an optimization succeed.

Run from `compiler/`, with the compiler/runtime already built:

```sh
node --conditions=react-server packages/babel-plugin-react-compiler/scripts/audit-independent-server-apps.cjs 5 /tmp/react-independent-apps.html
```

The command writes a standalone interactive report and adjacent JSON containing
individual timings, native call timelines, value hashes, generated source and
compiler retain/skip diagnostics. The report previews the actual rendered apps.

## Comparison modes

1. Original source, no compiler.
2. Compiler with no read contracts: a control for intentional eligibility limits.
3. Compiler with reviewed external contracts for the existing cached functions.
4. Separate hand-written non-consuming preload probes in `probes/`, using the
   same cached readers and leaving original component awaits/rendering intact.
5. Diagnostic only: remove defaulted `Page` props in a temporary copy, then
   compile with reviewed contracts. All supplied fixtures explicitly include
   those props. This isolates parameter handling without claiming the modified
   source has the original default-prop behavior for arbitrary inputs.

All modes use the same original native backend responses, 20 ms synthetic
latency per native request and an eight-operation backend cap. No bulk endpoint
or batch callback is invented, so the audit measures scheduling and detection,
not automatic batching. Read results are detached plain fixture data and frozen
by the audit to validate the declared immutable-result contract. The composite
`getTripTotals` helper is deliberately not misrepresented as a native endpoint.

Each fixture/mode gets a discarded warmup and the requested measured samples.
Every measured Flight payload is decoded by the actual RSC client in a separate
normal-React process, then rendered to static host HTML. Complete HTML, expected
visible text, native key/result-hash multisets, cache deduplication and operation
caps must match the original. Decode/process-startup time is excluded from
render timings. Fingerprints and missing/empty/cancelled fixtures prevent
rewriting the apps or starting unintended branches to manufacture a win.

The probes preserve the original error consumption sites and observe rejected
speculation; exact equivalence has been checked on the supplied success and
missing/empty/cancelled fixtures, not arbitrary injected failures. Read contracts
permit speculative work that may be unused if another read later fails.

An independent source reviewer, who did not inspect the compiler, predicted
three dependency layers for bookshop, four for confirmed travel, and five for
the active dashboard. It identified a guarded three-layer dashboard schedule.
The report measures those hypotheses rather than assuming them true.
