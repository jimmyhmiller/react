
## Input

```javascript
// @enableStateVariables
function Counter() {
  'use no memo';
  let count = 0;
  return <button onClick={() => count++}>{count}</button>;
}

```


## Error

```
Found 1 error:

Error: Cannot skip the compilation of a function with state variables

This function reassigns a variable after render, which makes the variable state. That only works when the function is compiled, but the 'use no memo' directive skips its compilation. Remove it, or use `useState`.

error.use-no-memo.ts:2:0
  1 | // @enableStateVariables
> 2 | function Counter() {
    | ^^^^^^^^^^^^^^^^^^^^
> 3 |   'use no memo';
    | ^^^^^^^^^^^^^^^^
> 4 |   let count = 0;
    | ^^^^^^^^^^^^^^^^
> 5 |   return <button onClick={() => count++}>{count}</button>;
    | ^^^^^^^^^^^^^^^^
> 6 | }
    | ^^ Cannot skip the compilation of a function with state variables
  7 |
```
