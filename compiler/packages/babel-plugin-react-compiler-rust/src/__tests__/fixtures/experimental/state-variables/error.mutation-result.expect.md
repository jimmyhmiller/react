
## Input

```javascript
// @enableStateVariables
function Stack() {
  let stack = [1, 2, 3];
  return (
    <button
      onClick={() => {
        const last = stack.pop();
        console.log(last);
      }}>
      {stack.length}
    </button>
  );
}

```


## Error

```
Found 1 error:

Error: Unsupported update of a state variable

`stack` is a state variable: a function updates it after render. The update is applied to a copy of the state when React processes it, so its result is not available here. Read the value before the update instead (`const last = stack.at(-1); stack.pop();`).

error.mutation-result.ts:7:21
   5 |     <button
   6 |       onClick={() => {
>  7 |         const last = stack.pop();
     |                      ^^^^^^^^^^^ The result of this update is used
   8 |         console.log(last);
   9 |       }}>
  10 |       {stack.length}
```
