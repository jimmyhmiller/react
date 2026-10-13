
## Input

```javascript
// @enableStateVariables
function Counter() {
  let count = 0;
  const increment = () => {
    count++;
  };
  increment();
  return <button onClick={increment}>{count}</button>;
}

```


## Error

```
Found 1 error:

Error: Cannot call setState during render

Calling setState during render may trigger an infinite loop.
* To reset state when other state/props change, store the previous value in state and update conditionally: https://react.dev/reference/react/useState#storing-information-from-previous-renders
* To derive data from other state/props, compute the derived data during render without using state.

error.written-during-render.ts:7:2
   5 |     count++;
   6 |   };
>  7 |   increment();
     |   ^^^^^^^^^ Found setState() in render
   8 |   return <button onClick={increment}>{count}</button>;
   9 | }
  10 |
```
