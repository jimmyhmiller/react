# Experiment 0001: Component Inlining (Rust compiler)

Status: in progress. Rust-only (`compiler/crates`). Gated by `enableComponentInlining` (default `false`).

## Goal

Replace a JSX call site `<Child a={x} />` of a same-module, hook-free function
component with the body of `Child`, so the parent directly produces `Child`'s
output. This removes the child's fiber, element and props objects, and lets the
parent's reactive scopes memoize the child's output.

The transform must be *unobservable* to application code: it is only applied
where we can show that rendering the inlined output is equivalent to rendering
the original element. Differences that are visible only to developer tooling
(component stacks, React DevTools tree, Profiler ids) are accepted and
documented below.

## Semantics of the original

`<C key={k} a={x}>{c}</C>` creates an element `{type: C, key: k, props: {a: x, children: c}}`.
When React renders that element at a position in the tree it (1) creates or
reuses a fiber of type `C` matched by position and key, (2) later calls `C(props)`
with hooks bound to that fiber, (3) reconciles `C`'s return value as that fiber's
child. The inlined form instead evaluates `C`'s body eagerly while the parent
renders and places the result directly at the position.

## Safety rules

Each rule removes one observable difference. A site is inlined only if every
rule holds.

### Callee (`C`) rules — checked once per module

| # | Rule | Difference it rules out |
|---|------|--------------------------|
| C1 | `C` is declared at module scope (function declaration or `const C = function/arrow`) and the binding is never reassigned. | The tag might not refer to this function at render time. |
| C2 | Every reference to `C` is a JSX element name or an export specifier. | Aliasing that could attach `defaultProps`, wrap in `memo`, or otherwise change behavior. |
| C3 | `C` calls no hooks (by name or type) and does not call `use`. | Hook state and context reads are bound to `C`'s fiber and position. |
| C4 | `C` has at most one parameter and is not async or a generator. | Legacy second `ref`/context argument. |
| C5 | `C` has no opt-out directive and compiles successfully on its own with inlining disabled. | Rule violations (e.g. mutating props) that the compiler would reject in `C` but might not detect once the props object becomes a local in the parent. Eager evaluation would change when such mutations happen. |
| C6 | Every value `C` returns is a non-Fragment JSX element or a primitive (literal, or the result of a unary/binary/template expression), following local stores and value-block merges. | A top-level unkeyed Fragment or array is unwrapped when it is the direct child of `C`'s fiber but becomes a Fragment fiber when placed among siblings, so switching between shapes would remount different subtrees. |
| C7 | `C` does not (transitively) render itself. | Unbounded inlining. |

### Site rules — checked per `JsxExpression` whose tag resolves to a candidate

| # | Rule | Difference it rules out |
|---|------|--------------------------|
| S1 | No spread attributes. | A spread object may carry `key`/`ref`, which React extracts. |
| S2 | No `ref` attribute. | `ref` handling differs by React version. |
| S3 | If the site has a `key`, none of `C`'s returned elements has its own `key`. The site key is moved onto each returned element. | Key identity would otherwise be lost or doubled. |
| S4 | **Rendered flow**: the element value only flows into a *fixed rendered position*: (a) a child of a host JSX element or fragment that is itself in rendered flow, (b) the parent component's return value, or (c) a local or value-block result that the element is stored into, where every other value stored there is a primitive and every load of it is in rendered flow. | If the element could reach a position that other element types also reach, React compares `C` to those types before inlining but compares `C`'s output after inlining. `cond ? <C/> : <span/>` would reuse a `<span>` DOM node instead of remounting. Values passed to other components could be inspected (`children.type`), cloned, rendered multiple times, or never rendered. |
| S5 | The site is in a statement block, or in a value block and `C` has a single return, only expression-level control flow, a destructured (or absent) parameter whose bindings are each loaded at most once, and no other named variables. | Value blocks can only contain expressions: they cannot hold statement terminals or variable declarations. Bindings there are substituted, and a substituted temporary used twice would be evaluated twice. |
| S6 | A site with more than one JSX child is inlined only when `C` destructures `children` and places it only in rendered positions. The children are then bound as a fragment. | React marks children passed to `jsxs` as static. An array built at runtime would trigger key warnings; a fragment reconciles identically without them. |
| S7 | Children of `textarea`, `option`, `title`, `script`, `style`, `noscript`, `fbt` and `fbs` are not rendered positions. | React stringifies or specially interprets these children, so their content is not rendered as elements. |
| S4(e) | A value returned by a function used exactly once, as the only argument of `.map(...)` whose result is in rendered flow, is in rendered flow. | Callbacks whose results could be inspected, stored or combined with other elements. The receiver is not required to be an array: a non-array `map` that calls the callback and inspects the returned element's type would observe the inlining. |

### Rendered list callbacks

A site inside a nested function is a rendered position only under rule S4(e):
the function is used exactly once, as the only argument of a `.map(...)` call
whose result is itself in rendered flow. Every value the callback returns is
then an item of a rendered list, and no other element types reach those item
positions.

**Performance rule.** The compiler does not memoize values inside callbacks, so
a component rendered from a callback is the per-item memoization boundary: its
own memo cache lets React skip unchanged rows. Inlining it with ordinary host
output is unobservable but makes every row re-render with the list. The first
TodoMVC benchmark run, which inlined `TodoItem` into `TodoList`'s `.map`
callback, measured 4x slower list updates. Callback sites are therefore inlined
only when compiled blocks are enabled and the callee returns a *leaf block*
(every value it returns is a block element whose slots may never hold JSX), or,
with `enableListItemMemoization`, any block (`Environment::returns_block`, set
by `CompileJsxBlocks`); per-item memoization then replaces the component's
memo cache as the per-row boundary. The status is computed with the other candidates inlined
into the component, and sites that come from inlining such a component into a
callback are inlined as they were in that computation. React DOM renders a list of such blocks without fibers and
compares each item's hole values, which replaces the memoization boundary (see
experiment 0002, "Inline lists"). With blocks disabled, callback sites are never
inlined.

### Accepted, tooling-only differences

- `C` does not appear in component stacks, React DevTools, or `<Profiler>` output.
- Errors thrown from `C`'s body are attributed to the parent's stack frame. Error
  boundaries are unaffected because no boundary can sit between the parent and
  an inlined position.
- Development-only key warnings name the parent instead of `C`.

### Fallback

If the parent fails to compile with inlining enabled, it is compiled again with
inlining disabled, and only that attempt's events are reported. Inlining can
therefore never turn a successful compilation into a bailout.

## Architecture

1. **Module analysis** (`entrypoint/inline_candidates.rs`, run from
   `compile_program`): collect module-scope component functions and apply rules
   C1, C2 and C4 on the AST. Then compile each remaining candidate on its own
   with inlining disabled, keeping its diagnostics out of the program's output,
   to apply C5.
2. **Pipeline pass** `InlineComponents`
   (`react_compiler_optimization/src/inline_components.rs`), placed immediately
   before `InlineImmediatelyInvokedFunctionExpressions`, before SSA:
   - For each JSX site whose tag is a `LoadGlobal` of a candidate, lower the
     callee with `react_compiler_lowering::lower` into the *parent's*
     `Environment`, which gives fresh identifiers, blocks and instructions. The
     callee has no captured context, so no remapping is needed.
   - Apply C3, C6 and C7 on the lowered callee HIR, and S1–S5 on the site.
   - Bind parameters. A destructured props parameter is bound property by
     property from the attribute places (no props object is allocated); `rest`
     properties become an object expression. An identifier parameter is bound
     to a new object expression. `children` follows React's normalization
     (none: absent, one: the value, many: an array).
   - Splice the callee CFG in place of the JSX instruction, using the same
     single-return (goto) and multi-return (label) shapes as IIFE inlining.
   - Repeat until no sites remain, which inlines nested components. The
     recursion stack enforces C7.
3. **Tests** (status: 21 experimental fixtures pass; the corpus run over all
   1810 fixtures shows no semantic differences. The one sprout mismatch,
   `reactive-control-dependency-phi-setState-type`, is a harness artifact:
   sprout JSON-stringifies non-element return values, while React renders the
   string as text either way):
   - Rust-only snap fixtures under
     `packages/babel-plugin-react-compiler-rust/src/__tests__/fixtures/experimental/`,
     run with `yarn snap --rust --experimental`. Sprout checks that the compiled
     output renders the same HTML as the uncompiled input.
   - Negative fixtures for every rule.
   - A corpus stress run executes all existing fixtures with the flag on and
     compares their sprout output against the unchanged source.
