# Live React Compiler article preview

This one-off preview reads the Markdown draft directly, compiles annotated JSX examples, and refreshes the browser when the file changes. It does not copy or rewrite the prose.

## Start

From this directory:

```sh
npm install
npm run dev -- /absolute/path/to/draft.md
```

Open <http://127.0.0.1:4177>. Pass the Markdown path explicitly; the preview has no machine-specific default. Set `PORT` to use another local port.

Every build runs on this repository's experimental React build in `<repo>/build/node_modules`, which has the compiled blocks runtime, so the same label means the same build in every widget. Build it from the repository root with:

```sh
RELEASE_CHANNEL=experimental node scripts/rollup/build.js \
  react/index,react/jsx-runtime,react/compiler-runtime,react-dom/index,react-dom/client,scheduler/index \
  --type=NODE_PROD
```

All optimized variants use this checkout's Rust Babel plugin. Build its native module and TypeScript wrapper with `yarn snap --rust` from `compiler/`, and restart the preview after rebuilding. Inlining follows the safety checks implemented on this branch; the preview does not load an alternate compiler from another worktree.

## Add an example

Put a self-contained React example in a fenced block. It must define `function App()` and may import React packages. Give the block an ID and place the corresponding marker anywhere in the draft:

````md
```tsx preview=my-example
function App() {
  return <button>Try me</button>;
}
```

[PREVIEW:my-example]()
````

The marker becomes a live widget. It shows the exact source compiled with the compiler off, the React Compiler, and inlining. Each variant gets its own production React bundle and isolated iframe. Compilation errors appear in the widget.

Use `[COMPILE:my-example:inlining]()` in the Markdown to place generated code directly in the article. The variant can be `plain`, `compiler`, `inlining`, or any other variant its widget shows. This block updates when the source changes, just like the widget.

Add `blocks-preview=other-id` to the fence to also get a `[PREVIEW:other-id]()` widget for the same source that adds compiled blocks (`blocks`) and inlining with compiled blocks (`inlining-blocks`) to the compiler off, React Compiler and inlining builds.

Add `stack-preview=other-id` for a `[PREVIEW:other-id]()` widget that stacks the optimizations that affect a list example: the compiler off, the React Compiler, inlining, inlining + blocks, then list item memoization (`inlining-blocks-lists`), then incremental list mapping (`inlining-blocks-lists-incremental`).

Add `scenarios=<group>` (and `id=<name>` unless the fence has a `preview=` id) to put a fence into the `[SCENARIOS:<group>]()` widget. That widget builds each of its fences with the full stack (the stack widget's builds plus context and store selectors) and offers one workload per benchmark: with `benchmark=single-row`, the `#run-2000` button; with `benchmark=buttons`, every button with a `data-benchmark` attribute, run after the app's `#setup` button if it has one. Benchmark buttons must only yield to microtasks (`await null`), like the examples do. **Time every build** mounts each build fresh 3 times and reports the median time from the click until every update has committed and the page has been laid out (paint is excluded, because frames come at the display's rate and would round short workloads up to a frame), the speedup over the React Compiler, and whether the final DOM matches the build without the compiler.

The current list example adds `benchmark=single-row` to the fence. Its own `#run-2000` button clicks its one-row button 2,000 times. The widget mounts each compiled variant fresh, clicks `#run-2000` once, waits for the final paint, and checks that 2,000 rows were committed. The displayed compiled output is the exact source used for the benchmark. Other examples can omit the benchmark option and still show a mounted app and generated code.

The numbers are local browser timings, including React work through the next paint. Compare repeated runs on the same machine and browser; they are not published benchmark results.
