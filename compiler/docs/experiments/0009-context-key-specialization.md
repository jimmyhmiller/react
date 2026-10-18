# Experiment 0009: Compiler specialization of Context keys

Status: opt-in Rust compiler implementation, `enableContextKeySpecialization`
(default false), requiring `enableContextSelectors` and the matching experimental
`react/compiler-runtime`. Client output only, target 19.

The existing SelectContextReads analysis proves dependencies. For a direct
useContext call whose selected entries are exactly one top-level Read, lower to
`unstable_useContextKey(Context, key)` instead of nested path-description arrays.
The original app source and component tree do not change. Other selections keep
the established lowering: nested paths, multiple keys, equality entries, unknown
uses/escapes, and custom hooks. Static and available dynamic keys are supported.

The compiler-runtime intrinsic uses the existing reconciler API. Its descriptor
belongs to one rendered dependency and lazily snapshots the old selected key.
It compares a new Context value with Object.is and remembers the last comparison
for that exact Context value, avoiding duplicate path interpretation and old-value
reads during propagation and bailout. Exceptions are not cached. Like compiler
memoization, this relies on immutable Context values and pure reads. It does not
introduce extra Fibers, provider boundaries, stores, or subscriptions.

Tests: context-keys compiler snapshots and ReactContextKey reconciler tests.
Measurement and reproduction: `compiler/apps/draw-benchmark/COMPILER_KEYS.md`.
The previous app-level scoped-provider experiment is rejected and is not evidence
for this compiler optimization.
