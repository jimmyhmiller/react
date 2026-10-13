
## Input

```javascript
// @enableStateVariables
function Counter({show}) {
  if (!show) {
    return null;
  }
  let count = 0;
  return <button onClick={() => count++}>{count}</button>;
}

```


## Error

```
Found 1 error:

Error: Cannot declare a state variable conditionally

`count` is a state variable: a function reassigns it after render. State is a hook, so its declaration must run on every render: at the top level of the component or hook, before any early return.

error.conditional-declaration.ts:6:2
  4 |     return null;
  5 |   }
> 6 |   let count = 0;
    |   ^^^^^^^^^^^^^^ `count` is declared conditionally
  7 |   return <button onClick={() => count++}>{count}</button>;
  8 | }
  9 |
```
