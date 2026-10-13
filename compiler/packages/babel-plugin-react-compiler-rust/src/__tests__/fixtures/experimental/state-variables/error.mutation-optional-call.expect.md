
## Input

```javascript
// @enableStateVariables
function List({item}) {
  let items = [];
  return (
    <button
      onClick={() => {
        items.push?.(item);
      }}>
      {items.length}
    </button>
  );
}

```


## Error

```
Found 1 error:

Error: Unsupported update of a state variable

`items` is a state variable: a function updates it after render. An optional call of a method that updates it is not supported.

error.mutation-optional-call.ts:7:8
   5 |     <button
   6 |       onClick={() => {
>  7 |         items.push?.(item);
     |         ^^^^^^^^^^^^^^^^^^ This method is called optionally
   8 |       }}>
   9 |       {items.length}
  10 |     </button>
```
