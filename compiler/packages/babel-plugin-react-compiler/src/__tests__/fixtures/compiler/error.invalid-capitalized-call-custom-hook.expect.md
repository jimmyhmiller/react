
## Input

```javascript
// @validateNoCapitalizedCalls @customHooks:{"MyCustomHook":{"effectKind":"read","valueKind":"frozen","noAlias":true,"transitiveMixedData":false}}
function Component(props) {
  const x = MyCustomHook(props.a);
  return <div>{x}</div>;
}

```


## Error

```
Found 1 error:

Error: Capitalized functions are reserved for components, which must be invoked with JSX. If this is a component, render it with JSX. Otherwise, ensure that it has no hook calls and rename it to begin with a lowercase letter. Alternatively, if you know for a fact that this function is not a component, you can allowlist it via the compiler config

MyCustomHook may be a component.

error.invalid-capitalized-call-custom-hook.ts:3:12
  1 | // @validateNoCapitalizedCalls @customHooks:{"MyCustomHook":{"effectKind":"read","valueKind":"frozen","noAlias":true,"transitiveMixedData":false}}
  2 | function Component(props) {
> 3 |   const x = MyCustomHook(props.a);
    |             ^^^^^^^^^^^^^^^^^^^^^ Capitalized functions are reserved for components, which must be invoked with JSX. If this is a component, render it with JSX. Otherwise, ensure that it has no hook calls and rename it to begin with a lowercase letter. Alternatively, if you know for a fact that this function is not a component, you can allowlist it via the compiler config
  4 |   return <div>{x}</div>;
  5 | }
  6 |
```
          
      