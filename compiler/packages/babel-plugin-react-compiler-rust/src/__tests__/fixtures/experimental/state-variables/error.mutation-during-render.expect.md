
## Input

```javascript
// @enableStateVariables
function Todos({first}) {
  let todos = [];
  const add = todo => {
    todos.push(todo);
  };
  add(first);
  return <button onClick={() => add('more')}>{todos.length}</button>;
}

```


## Error

```
Found 1 error:

Error: Cannot call setState during render

Calling setState during render may trigger an infinite loop.
* To reset state when other state/props change, store the previous value in state and update conditionally: https://react.dev/reference/react/useState#storing-information-from-previous-renders
* To derive data from other state/props, compute the derived data during render without using state.

error.mutation-during-render.ts:7:2
   5 |     todos.push(todo);
   6 |   };
>  7 |   add(first);
     |   ^^^ Found setState() in render
   8 |   return <button onClick={() => add('more')}>{todos.length}</button>;
   9 | }
  10 |
```
