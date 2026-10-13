
## Input

```javascript
// @enableStateVariables
function List({items}) {
  let n = 0;
  const rows = items.map(item => {
    n++;
    return <li key={n}>{item}</li>;
  });
  return (
    <ul
      onClick={() => {
        n = 0;
      }}>
      {rows}
    </ul>
  );
}

```


## Error

```
Found 1 error:

Error: Cannot update a state variable during render

`n` is a state variable: a function updates it after render. Updating it during render as well would update state while rendering. Compute the value in another variable instead.

error.reassigned-in-render-callback.ts:5:4
  3 |   let n = 0;
  4 |   const rows = items.map(item => {
> 5 |     n++;
    |     ^^^ `n` is reassigned by a function that is called during render, whose result is used after render
  6 |     return <li key={n}>{item}</li>;
  7 |   });
  8 |   return (

error.reassigned-in-render-callback.ts:3:2
  1 | // @enableStateVariables
  2 | function List({items}) {
> 3 |   let n = 0;
    |   ^^^^^^^^^^ `n` is declared here
  4 |   const rows = items.map(item => {
  5 |     n++;
  6 |     return <li key={n}>{item}</li>;
```
