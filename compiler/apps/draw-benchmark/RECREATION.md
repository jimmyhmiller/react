# Historical recreation notes

This document records the initial released-React recreation before integration into this worktree. Its run commands and recorded numbers are historical. Use [README.md](README.md) for the local Rust compiler matrix and [RESULTS.md](RESULTS.md) for its measurements.

# DRAW — React performance recreation

A runnable, independent recreation of the workload described in Joe Savona’s [Exploring React Performance, React Conf 2025](https://www.youtube.com/watch?v=uAmRtE52mYk). **This is not the original DRAW application or original trace.** Its timings are measurements of this implementation on the machine running it, not a reproduction of the talk’s numbers.

## Run locally

Requires Node.js 20.19+ or 22.12+ and npm (tested with Node 26.5.0). From this directory:

```sh
npm ci
npm run build
npm start
```

Open <http://127.0.0.1:4173/baseline/>. Navigation switches between three separate production builds:

- `/baseline/`: React 19.2.0, one state map through Context, no manual memoization.
- `/compiler/`: the same editor and Context adapter with React Compiler 1.0.0 enabled.
- `/store/`: the same editor with Compiler and an entity-subscribed external store.

Use **Run benchmark** for two warmups and five measured trials by default. It reports the median and every raw timing; **Export JSON** saves metadata and results. **Verify 5,000 commits** runs the heavier correctness checks separately. The editor supports adding boxes/text, clicking an object to select it, editing width/height/X/Y, editing text, and clearing the artboard. New objects start at 1×1 pixels; resize them through the fields.

For development only: `npm run dev`, `npm run dev:compiler`, or `npm run dev:store`. The development server serves one variant; the variant navigation is intended for `npm start`. Do not compare development timings.

## What is known and what is inferred

The supplied talk transcript establishes:

- Around 2:38–4:22: a simplified prototyping editor draws the React logo through a scripted sequence of 5,000 interactions. It supports boxes and text labels. Actions include simulated clicks and width/height/X/Y edits. Commands were reportedly derived from the logo’s SVG.
- Every interaction synchronously updates the DOM without yielding; browser layout and paint occur afterward.
- Around 5:02–5:57: baseline state is a giant hash map in one React state value passed through Context. Entity components receive IDs, read Context, look up their own record, and use its fields. The compiler variant uses that same model.
- Around 16:50–17:05: the external-store variant has entity-ID reads and subscriptions, publishing changes to a few records at a time.

**Inferred here:** entity count, coordinates, hierarchy, styling, shape sizes, initial values, exact action order, the “React” label, and the mapping from logo geometry to commands. `src/trace.js` deterministically samples three ellipses with 900 small boxes, fills the core with 99 boxes, and adds one text label. Each of these 1,000 entities uses exactly five state-changing UI events: click Add, edit width, edit height, edit X, edit Y. There are no padding no-ops or random inputs. The original SVG and action recording were not obtained. This approximated construction can materially change performance relative to the talk.

The roughly four-second baseline mentioned in the talk is contextual only; no result here is calibrated to that number.

## Architecture and timing contract

`src/Editor.jsx` is shared by every build. `vite.config.js` changes compiler configuration between baseline and compiler; both resolve the exact same Context adapter. The store variant intentionally changes the state adapter too. All builds use the same React version, trace, UI, event driver, and production build settings. No React Profiler, development Strict Mode, render-count instrumentation, fine-grained store, or manual `memo`/`useMemo`/`useCallback` is present in the baseline.

The Context adapter holds the database in a single `useState`. Records include `$document` (IDs/selection), `$clock` (revision), and shape entities. Each update shallow-copies the map and the changed records. Entity components receive only `id` and read their fields from Context. `Entity` creates a style object and JSX on each baseline render; the compiler is free to reuse them. The revision record makes each committed action observable in the DOM in all three variants; that small overhead is included in all timings.

The external store exposes `get(id)`, `subscribe(id, callback)`, and `dispatch(action)`. It updates only changed records, preserves unchanged record identities, and notifies their subscribers after all patches are installed. `useSyncExternalStore` provides React integration with stable record snapshots. It avoids whole-map copying as well as broad Context invalidation, so its comparison measures **both** architecture and compiler effects. It is not a compiler-only comparison.

The driver in `src/runner.js` calls real button `.click()` handlers or sets a real input’s value and dispatches a bubbling `input` event. Each individual event runs inside `flushSync`. React’s documented [flushSync contract](https://react.dev/reference/react-dom/flushSync) guarantees the DOM update before returning. Synthetic events are not trusted physical mouse/keyboard events, and their dispatch overhead is included.

One trial:

1. Resets the editor outside timing.
2. Reads `performance.now()`.
3. Executes all 5,000 events with one `flushSync` per event in a single uninterrupted JavaScript task.
4. Reads `performance.now()` again.
5. Checks final state and DOM outside timing.

There are no layout APIs, `getComputedStyle`, DOM geometry reads, awaits, animation frames, observers, or profiler callbacks in the timed loop. DOM lookup and event dispatch, React rendering/reconciliation/commits, state updates, allocation, and any GC during the loop are included. Layout and paint after the task are excluded. Animation-frame gaps between trials let the browser render. This deliberately measures a blocking workload, not interactive responsiveness or frame rate.

## Verification and repeatable measurements

Browser commands use installed Google Chrome via Playwright by default. To use Playwright’s downloaded Chromium, run `npx playwright install chromium` and set `BROWSER_CHANNEL=chromium`. `HEADED=1` opens a visible browser. Browser tests start their own ephemeral loopback server and close it afterward.

```sh
npm test                 # trace/model/store unit tests
npm run build
npm run test:compiler    # generated Entity memo-cache evidence
npm run test:browser     # 5,000 per-action checks per build, cross-build equality, screenshots
npm run test:layout      # separate traced run: no layout/paint in the loop
npm run bench            # 2 warmups + 5 trials per build, rotating variant order
# WARMUPS=3 TRIALS=9 HEADED=1 npm run bench
```

Correctness verification observes DOM mutations after **every** `flushSync`, checks exactly one revision transition, and checks that the affected shape already has its expected geometry before starting the next action. It then checks the complete state against pure trace replay and every final shape’s DOM fields. Browser tests compare the entire state and the editor’s HTML across all builds and verify that neither a queued microtask nor an animation frame ran during verification. Separate Chrome tracing checks for Layout, Paint, and UpdateLayoutTree events. Those instrumented runs are never used as performance measurements.

The benchmark script rotates order across rounds, runs variants sequentially, retains each variant’s page for warmup, and checks final output after each trial. Keep other CPU-intensive work and DevTools closed when measuring. Hardware, browser, JIT, GC, thermal conditions, and background work affect results. Headless numbers are not interchangeable with visible-browser numbers or Joe’s laptop.

Generated evidence is in `artifacts/`:

- `correctness.json`: commit counts, identical state/DOM hashes, browser version.
- `final-state.json`: full replayed database.
- `baseline.png`, `compiler.png`, `store.png`: final editor screenshots.
- `compiler-editor.jsx`, `compiler-audit.json`: compiler transform using the build’s compiler settings; generated style/JSX memoization is visible in `Entity`. This is diagnostic output, not served app code. See the official [compiler setup and output verification](https://react.dev/learn/react-compiler/installation).
- `layout-check.json`: separate tracing diagnostics.
- `benchmark.json`: warmup/raw/median timings, exact execution order, CPU/OS/browser and dependency metadata. Rerunning overwrites these local artifacts.

## Original-source investigation

Joe’s public [old-experiments branch](https://github.com/josephsavona/react/tree/old-experiments/packages/forest/src), pinned to [commit 5b3dbbef9f327445df259c5bab2b7df270f34a77](https://github.com/josephsavona/react/commit/5b3dbbef9f327445df259c5bab2b7df270f34a77), contains related original **Fir runtime research source**, including `Fir.js`, `FirDOM.js`, `FirState.js`, and `FirWorkloop.js`. It is not the original DRAW workload.

For this task, the full recursive Git tree (not truncated) and the source archive at that commit were inspected. No DRAW application/trace was found; searches for DRAW/drawing, React-logo workload text, benchmark references, and imports of these Fir modules did not locate a harness. `packages/forest` contains 21 runtime files and no package manifest or README. This does not prove the workload is unavailable elsewhere or in other history.

No code from that runtime is vendored, and no Forest/Fir variant or timing is fabricated. This project uses released React/Compiler packages; integrating that research runtime would be a separate task.

## Recorded local result

Measured October 15, 2026 on Apple M2 Max, headless Chrome 155.0.8059.40, production builds. Two warmups and five trials per variant; order rotated each round. These are results for `inferred-box-logo-v1`, not the talk’s original benchmark.

| Variant | Median (ms) | Raw measured trials (ms) |
| --- | ---: | --- |
| Baseline Context | 2491.9 | 2529.6, 2491.9, 2464.5, 2471.5, 2521.2 |
| Compiler Context | 1456.3 | 1449.2, 1530.6, 1469.9, 1445.9, 1456.3 |
| Compiler + external store | 686.6 | 690.9, 686.6, 681.7, 673.1, 687.7 |

All three builds passed 5,000 individual synchronous-commit assertions, manual editor checks, and full final state/editor-HTML equality. Separate tracing found zero Layout/Paint/UpdateLayoutTree events inside the diagnostic interval. Three unit tests and the compiler memoization audit passed. Full metadata and warmup timings are retained in `artifacts/benchmark.json`.
