
## Input

```javascript
// @enableStateVariables
function Counter() {
  const increment = () => {
    count++;
  };
  let count = 0;
  return <button onClick={increment}>{count}</button>;
}

```


## Error

```
Found 1 error:

Error: Cannot use a state variable before its declaration

`count` is a state variable: a function reassigns it after render. Declare it before the functions that use it.

error.use-before-declaration.ts:6:2
  4 |     count++;
  5 |   };
> 6 |   let count = 0;
    |   ^^^^^^^^^^^^^^ `count` is declared here
  7 |   return <button onClick={increment}>{count}</button>;
  8 | }
  9 |
```
