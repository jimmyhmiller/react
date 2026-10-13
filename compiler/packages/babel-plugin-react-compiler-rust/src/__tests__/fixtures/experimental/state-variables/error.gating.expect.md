
## Input

```javascript
// @enableStateVariables @gating
function Counter() {
  let count = 0;
  return <button onClick={() => count++}>{count}</button>;
}

```


## Error

```
Found 1 error:

Error: Cannot skip the compilation of a function with state variables

This function reassigns a variable after render, which makes the variable state. That only works when the function is compiled, but gating, which keeps the uncompiled function as a fallback, skips its compilation. Remove it, or use `useState`.

error.gating.ts:2:0
  1 | // @enableStateVariables @gating
> 2 | function Counter() {
    | ^^^^^^^^^^^^^^^^^^^^
> 3 |   let count = 0;
    | ^^^^^^^^^^^^^^^^
> 4 |   return <button onClick={() => count++}>{count}</button>;
    | ^^^^^^^^^^^^^^^^
> 5 | }
    | ^^ Cannot skip the compilation of a function with state variables
  6 |
```
