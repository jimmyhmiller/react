# Experiment 0007: State variables

Status: implemented. Rust-only (`compiler/crates`). Gated by
`enableStateVariables` (default `false`). Needs two functions of the compiler
runtime (`unstable_copyForUpdate`, `unstable_freezeState`), which are in
`react-compiler-runtime` and in this repository's `react/compiler-runtime`, not
in a published React.

## Goal

The compiler removed the need to write `useMemo` and `useCallback`. This
experiment removes the need to write `useState`: state is a `let`, and an
update is an assignment or a mutation.

```js
function Todos() {
  let text = '';
  let todos = [];
  return (
    <>
      <input value={text} onChange={e => (text = e.target.value)} />
      <button
        onClick={() => {
          todos.push({id: todos.length, title: text, done: false});
          text = '';
        }}>
        Add
      </button>
      {todos.map((todo, i) => (
        <Todo key={todo.id} todo={todo} onToggle={() => { todos[i].done = !todos[i].done; }} />
      ))}
    </>
  );
}
```

The output is ordinary React: `useState` hooks and setter calls with immutable
updates. There is no new runtime model, no proxies and no signals. Concurrent
rendering, transitions, Suspense, StrictMode, DevTools and Fast Refresh see a
component that uses `useState`.

```js
const [text, setText] = useState('');
const [todos, setTodos] = useState([]);
// ...
onClick={() => {
  const t0 = {id: todos.length, title: text, done: false};
  setTodos(todos => {
    const t1 = copyForUpdate(todos);
    t1.push(t0);
    return t1;
  });
  setText('');
}}
```

## Which variables are state

No marker. A variable is a state variable when:

1. it is declared with `let` in the body of a component or hook, and
2. a function that **runs after render** reassigns it, or modifies its value.

Today both are compile errors ("Cannot reassign variable after render
completes", "This argument is a function which may reassign or mutate `x` after
render"). So the experiment gives a meaning to programs that the compiler
rejects today; no program that compiles today changes behavior. A closure that
reassigns a local *during* render leaves it a local:

```js
let total = 0;
items.forEach(item => { total += item.price; }); // not state
```

Never state:

- a `const`. Its value may well be modified after render, but that is as
  likely to be an object that is meant to be (what a hook returned, a class
  instance) as state. This is the cost of not having a marker: `prefer-const`
  must not be applied to a `let` that is only mutated.
- a ref (`let ref = useRef()`), which is modified after render by design.

### Which functions run after render

`infer_post_render_functions.rs`. A function runs after render when React, not
the render, calls it: it is passed where a frozen value is expected (a JSX prop,
a hook argument), it is returned from the component or hook, it is async, or it
is reachable from such a value. This is the condition that
`ValidateLocalsNotReassignedAfterRender` rejects a reassignment under, computed
for every function instead of for the first reassignment.

Each function value is followed through the identifiers it flows to,
**directly** (a variable, an object or array, a function that captures it, the
result of calling a function that returns it — `onClick={select(id)}` where
`select` returns the handler) or **derived** (once it has been passed to a
call: the result of `items.map(callback)` depends on `callback` but is not
`callback`). A function that is frozen directly runs after render. A function
that is only frozen through a derived value (the `.map` callback whose result
is rendered) is most likely called during render, but the compiler cannot prove
it; a write in such a function does not make a variable state, and is an error
if the variable is state for another reason.

The *root* of a write is the outermost function around it that runs after
render.

## Semantics

### Declaration

`let x = init;` becomes `const [x, setX] = useState(init);`, and `let x;`
becomes `useState()`. A destructuring declaration makes one state per name.
The setter is named `set` + the capitalized name, or that with a number if the
name is taken (by any binding of the file, or a global that the function
references: `let timeout` must not shadow `setTimeout`).

The initializer is **not** wrapped in a function (`useState(() => init)`), as
the design proposed. It is evaluated on every render like any other expression
of the component, which the compiler memoizes like any other: `[]` is
allocated once, `expensive(props.a)` is recomputed when `props.a` changes, and
its value is ignored after the mount. Wrapping would require moving arbitrary
HIR (several blocks for a conditional initializer) into a function.

Hook order is declaration order, so a state variable's declaration must run
unconditionally: at the top level of the function body, before any early
return, and before the functions that use it. Anything else is an error.

### Reads

A read, in render or in a function, is the value of the render that created
the function. This is what React does today. There is no "latest value" cell:
under concurrent rendering there is no single latest value, and a handler that
reads one would see state that no committed render has shown.

The exception is a read that may follow a write in the same root
(`count++; log(count)`). A root with such a read (decided on the control flow
graph: a read is reachable from a write, or is in a nested function, which can
be called at any point) gets a **shadow**: a local initialized from the state,
which the functions of the root read and write instead, as plain JavaScript
would. Writes to the shadow also call the setter.

```js
onClick={() => { count++; count += step; log(count); }}
// =>
() => {
  let currentCount = count;
  currentCount = currentCount + 1;
  setCount(count => count + 1);
  currentCount = currentCount + step;
  setCount(count => count + step);
  log(currentCount);
}
```

Functions nested in the root share the shadow, whether the root calls them
(`items.forEach(item => { total += item.price })`) or something else does later
(`setTimeout`). After an `await` the shadow is still the function's own value;
writes made by other handlers in the meantime are not visible, as today.

React ignores what the event handler of a host element returns, so for a
function that is only used as an `on*` prop of a host element, the value of
`() => count++` is not a read: the arrow function's body becomes a statement.
A component may use what a function prop returns, so there the value is kept
(`onNext={() => count++}` returns the value of the render).

### Assignment

A write whose value is computed from the variable by pure operators in the same
block (`count + 1`, `[...todos, todo]`, `{...user, name}`, `!on`,
`user.age + 1`) becomes an **updater**: `setCount(count => count + 1)`. The
operators move into the updater and everything else they use is captured:

- a constant or a global is computed again inside the updater;
- a variable that is never reassigned, or the value of another state variable
  in this render (one without a shadow), is captured as it is;
- anything else is stored in a `const` where it is computed, so that it is
  computed once (`const n = next(); count = count + n` captures `n`).

Updater form means that consecutive updates compose (two `count++` add 2, also
across calls of the same function before a render and across transitions), and
that a function that only writes does not depend on the value: `() => count++`
is memoized with no dependencies, and an interval created once by an effect
keeps counting (`effect-interval.js`), where the hand-written
`setCount(count + 1)` is the classic stale closure.

Any other write passes the value, `setX(value)`, which is what hand-written
code would do:

- a method or function call on the state (`text = text.trim()`), which an
  updater cannot repeat;
- anything that may run code between the read of the variable and the write
  (`count = count + step()`): that code could write the variable, which an
  updater would see and plain JavaScript would not. Write
  `const s = step(); count += s;` to get an updater;
- a write that does not read the variable.

`x++` on a state variable is lowered as `x = x + 1`, the way the compiler
already lowers `a.b++`; `x++` of a string concatenates instead of converting
to a number.

### Mutation: compiled copy-on-write

React state must be updated immutably. The user writes a mutation; the compiler
emits the immutable update. A mutation by a function that runs after render
whose target is a **static path** of a `let` — the variable followed by
property loads with static names or computed keys: `todos`, `user.address`,
`todos[i]`, `grid[r][c]` — becomes an updater that copies each value on the
path, mutates the last copy, and returns the first:

```js
user.address.city = city;
// =>
setUser(user => {
  const t0 = copyForUpdate(user);
  const t1 = copyForUpdate(t0.address);
  t0.address = t1;
  t1.city = city;
  return t0;
});
```

Only values on the path are copied; siblings keep their identity, which is what
per-item memoization (0002) and incremental list mapping (0006) need. What the
mutation uses (keys, the stored value, arguments) is computed where the
mutation was written and captured, by the rules above. With a shadow, the same
updater is applied to the shadow, so reads that follow see the update and
updates still compose:

```js
const update = stack => { ... };
currentStack = update(currentStack);
setStack(update);
```

Mutations that are recognized:

- a property store (`path.p = v`, `path[k] = v`, `path.p += v`, `path.p++`)
  and a property delete;
- a method call whose signature mutates the receiver (`push`, `pop`,
  `Map.set`, `Set.add`, `delete`, `clear`), which depends on the receiver's
  inferred type;
- a method call **that the compiler knows nothing about** — the method has no
  signature (`splice`, `sort`, `reverse` of an array), or the type of the
  receiver is unknown (state initialized from props) — **if nothing uses its
  result**: such a call can only have been made for its effect on the receiver.
  A method that every built-in collection that has it declares read-only
  (`forEach`, `map`, `has`) is not a mutation of a receiver of unknown type,
  and neither is a call whose result is used (`items.slice(0, 1)`, or
  `tags = tags.add(tag)` of a persistent collection).

`unstable_copyForUpdate` copies arrays, plain objects, Maps and Sets. For
anything else (a class instance, a DOM node) it **throws**: returning the value
uncopied would modify state in place and the update would be lost.

A type cast on the path is the same value (`(draft as Draft).title = title`).

#### Optional chains

`user?.tags.push(tag)` does nothing unless `user` has a value. The updater tests
what the chain tests, in the state that it is given (which is more correct than
testing the value of the render: another pending update may have set it), and
leaves that state as it is when a test fails:

```js
setUser(user => {
  if (user == null) {
    return user;
  }
  const t0 = copyForUpdate(user);
  ...
});
```

The call of the setter replaces the whole chain, so the handler does not read
`user`. This works for any link of the chain (`user.address?.lines.push(line)`),
and for a chain inside another expression (`enabled && items?.push(item)`).

#### Aliases

A `const` that holds a value of the state is the path it was read from:
`const todo = todos[i]; todo.done = true;` is `todos[i].done = true`. But an
update does not modify the object that the alias holds, it replaces it with a
copy, so:

- a read of the alias that follows an update of its object
  (`todo.count++; todo.count++;`) is replaced with a read of the path, which is
  then a read of the state that follows a write (a shadow);
- a path only names the same object as the alias while nothing replaces what is
  on it. If something may have since the alias was declared (`todos.sort()`, an
  assignment, a store to a place on the path), a read or mutation through the
  alias is an error: "read the value from the state variable again".

#### What is not recognized

A mutation of a value that is reached dynamically:
`todos.find(isDone).done = true`, the item of `todos.forEach(todo => { ... })`,
the item parameter of a rendered `.map` (use the index: `todos[i]`). The
compiler does not reject these (it does not reject them for a hand-written
`useState` either: `find` is not known to return a part of its receiver), and
they would modify the state in place, which React never renders.

So in development, every state variable's value is **deeply frozen** on every
render (`unstable_freezeState`: arrays and plain objects; cheap once frozen),
the way Immer and Redux Toolkit freeze state. A modification that is not an
update then throws at the line that makes it, instead of being lost. The
contents of a Map or a Set cannot be frozen.

### Custom hooks

Hooks are compiled like components, so state variables work in them:

```js
function useToggle(initial) {
  let on = initial;
  return [on, () => { on = !on; }];
}
```

In the `infer` compilation mode a function named like a hook is only compiled
if it calls a hook or creates JSX. With this flag, a function named like a hook
whose nested function reassigns one of its variables is also compiled: it
calls `useState` once compiled.

A state variable is not a reference. Returning it, or passing it as a prop,
passes its value in that render. A child or a caller changes it through a
function that the owner provides. There is no two-way binding.

## Errors

The compiler becomes part of the language here. Without it, this code does not
run slowly; it is wrong. So nothing falls back silently: **every error in a
function that has state variables is fatal**, whatever the `panicThreshold`,
and so is skipping its compilation (`'use no memo'`, a module level opt-out,
the `annotation` mode without an opt-in).

- The declaration is conditional, in a loop, after an early return, or after a
  function that uses the variable.
- The variable is also updated during render: by the component, by a function
  that is not used after render, or by a function that is called during render
  whose result is used after render. A function that writes and is also called
  during render is reported as a `setState` during render.
- An update by a generator.
- The result of a mutation is observed (`const last = stack.pop()`): the
  mutation is applied to a copy when React processes it. Read the value first.
  A mutation inside an expression whose value nothing uses is fine
  (`selected.has(id) ? selected.delete(id) : selected.add(id);`,
  `enabled && list.push(item);`).
- An optional *call* of a method that mutates (`items.push?.(item)`): the chain
  tests the method, not a value of the state.
- Gating (the `gating` option, or a `'use memo if(...)'` directive), which
  keeps the function as it was written for when the gate is off.
- A mutation uses a value that the updater cannot capture (it is computed
  across several blocks, like a conditional expression): compute it in a
  `const` first.
- A mutation that is part of an expression while the variable is read after it.
- A stale alias (above).
- Anything the compiler does not support (`x ||= y`), since it cannot skip the
  function. This includes a function that only *may* have state variables (it
  passes the prefilter) when its analysis fails: the compiler cannot tell
  whether skipping it is safe.

## Architecture

Which functions run after render depends on the operand effects of
`InferMutationAliasingRanges`, and which methods mutate on inferred types. But
the rewrite inserts hook calls and changes what is reactive, so it has to
happen before any inference. So there are two lowerings:

1. **Prefilter** (`has_state_variable_candidates`, after `lower`): does a
   nested function reassign a `let` of the function, or call a method on, store
   to or delete from a path of one? If not, nothing else runs.
2. **Analysis** (`pipeline.rs: infer_post_render_functions`): the function is
   lowered a second time into an environment of its own and run through the
   passes up to `InferMutationAliasingRanges`. The result
   (`PostRenderFunctions`) names functions by `FunctionId` and method calls by
   `InstructionId`. Lowering is deterministic, so these identify the same
   things in the first lowering; their source locations are compared to make
   sure. The diagnostics of this environment are discarded.
3. **Rewrite** (`LowerStateVariables`, `state_variables.rs`, right after
   lowering): declarations, reads, writes, shadows, updaters (new
   `HirFunction`s), and the captured variables of every nested function. Its
   output is a function that calls `useState`.
4. The rest of the pipeline is unchanged, and so are the other experiments:
   blocks see holes fed by a state value, and list memoization sees an
   immutable update (checked with every flag on at once). Component inlining
   summarizes a callee from its own lowering, where a state variable is not a
   hook call yet, so `summarize_callee` rejects a callee with state variable
   candidates as one that calls hooks (rule C3). A parent with state variables
   inlines its children as usual.

Fast Refresh sees the `useState` calls: the hook signature that
`react-refresh/babel` computes changes when a state variable is added, with the
plugins in either order, so the component remounts instead of reading hooks
that moved.

`BuildHIR` lowers `x++` of a captured variable with the flag (a Todo without
it).

The cost of the flag for a function without state variables is the prefilter.
A function with candidates is lowered and inferred twice.

## What this gives the other experiments

A `useState` setter is a value. It can be passed to a child, stored, or handed
to a library, so the compiler cannot see every update. A state variable cannot
escape: **every write is an assignment or mutation in the component's own
source**, with its shape.

- *Choosing locality from handlers* (idea 4) and *list changes from updaters*
  need to know what each handler does to each piece of state. With state
  variables that is exact: `todos[i].done = …` is "item `i` replaced",
  `todos.push(x)` is an append — the edit kinds 0006 currently rediscovers at
  runtime by diffing.
- *Update slicing* (0004, idea 3) wants, per state variable, the slice of
  render that depends on it. Knowing that a handler writes only `text`, and
  that `text` flows only to one hole, is the whole input to that decision.
- A state variable whose value never reaches render output (only read in
  handlers and effects) does not need to re-render anything; it can be a ref.
  Not done: reads of a ref are "latest value" reads, a different read
  semantics from the one above.

Nothing is fed to the other experiments yet.

## Open problems

- **Derived becomes state silently.** `let label = props.name.toUpperCase();`
  is a derived local. Adding a handler that assigns `label` makes it state, and
  it stops following `props.name`. Svelte 3 had the same trap. A diagnostic for
  "state variable whose initializer reads reactive values" is too noisy
  (`let count = props.initialCount` is the normal idiom). Unresolved.
- **Uncompiled code is wrong, not slow.** A file excluded by `sources`, a
  function the compiler does not recognize as a component or hook (a
  lowercase-named function that returns JSX), or a build without the plugin
  produces code that runs and never updates. The errors above cover every
  function the compiler looks at; nothing covers the ones it does not. A lint
  rule sharing the prefilter would. This is the real cost of the idea, and the
  reason Svelte moved from inferred `let` to explicit runes — though their main
  problem (it only worked at the top level of `.svelte` files) does not apply,
  since hooks compile too.
- **Dynamic paths** are only caught in development, at runtime, and not inside
  Maps and Sets. `todos.find(...).done = true` and mutating the item of a
  rendered `.map` are natural code. Resolving the item parameter of a `.map` or
  `forEach` on a state path to `path[index]` would cover most of it.
- **An unknown method with an unused result is assumed to mutate.**
  `let logger = useLogger(); logger.flush();` in a handler makes `logger`
  state, and `copyForUpdate` throws for a class instance. The fix is `const`,
  which the message does not say.
- **The initializer is evaluated on every render** (see Declaration).
- **TypeScript and ESLint** accept the source as is. `prefer-const` and
  `react-hooks/immutability`-style rules need to learn the rule in "Which
  variables are state".
- **DevTools** shows unnamed `State` hooks. The compiler knows the names.

## Tests

- 36 fixtures in
  `packages/babel-plugin-react-compiler-rust/src/__tests__/fixtures/experimental/state-variables/`
  (`yarn snap --rust --experimental -p 'state-variables/*'`), 10 of them
  `error.` fixtures. They are not evaluated by snap, whose React does not have
  the runtime functions.
- `scripts/test-state-variables.mjs` (`node --test`): 24 behavior tests that
  compile components with the Rust plugin, render them with React DOM and fire
  events: updates, composition of updates within and across calls, handlers
  that do not change, an effect's interval, a custom hook, async, nested
  closures, lists, destructuring, the value of an assignment, StrictMode,
  mutations (arrays, objects, Map, Set, unknown methods, structural sharing,
  the previous state left unmodified), aliases, a value that cannot be copied,
  the development freeze, and the fatal errors under `panicThreshold: 'none'`.
- `packages/react-reconciler/src/__tests__/compilerStateVariables-test.js`: the
  two runtime functions, in development and production.

`node scripts/experiment-compile.mjs <file> --state` prints the output for a
file.

## Next

1. Item parameters of `.map` / `forEach` on a state path as `path[index]`.
2. The result of a mutation (`const last = stack.pop()`), by applying the
   mutation to the shadow where it is written.
3. A lint rule for functions the compiler does not compile.
4. Feed write shapes to 0006 (edit kinds without diffing) and 0004.
5. Refs for state that never reaches render output.
