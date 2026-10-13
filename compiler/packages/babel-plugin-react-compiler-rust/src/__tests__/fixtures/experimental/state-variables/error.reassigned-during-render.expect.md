
## Input

```javascript
// @enableStateVariables
function Counter({items}) {
  let count = 0;
  count = items.length;
  return <button onClick={() => count++}>{count}</button>;
}

```


## Error

```
Found 1 error:

Error: Cannot update a state variable during render

`count` is a state variable: a function updates it after render. Updating it during render as well would update state while rendering. Compute the value in another variable instead.

error.reassigned-during-render.ts:4:2
  2 | function Counter({items}) {
  3 |   let count = 0;
> 4 |   count = items.length;
    |   ^^^^^ `count` is reassigned during render
  5 |   return <button onClick={() => count++}>{count}</button>;
  6 | }
  7 |

error.reassigned-during-render.ts:3:2
  1 | // @enableStateVariables
  2 | function Counter({items}) {
> 3 |   let count = 0;
    |   ^^^^^^^^^^^^^^ `count` is declared here
  4 |   count = items.length;
  5 |   return <button onClick={() => count++}>{count}</button>;
  6 | }
```
