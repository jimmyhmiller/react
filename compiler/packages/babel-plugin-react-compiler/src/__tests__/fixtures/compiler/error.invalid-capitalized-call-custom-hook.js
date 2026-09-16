// @validateNoCapitalizedCalls @customHooks:{"MyCustomHook":{"effectKind":"read","valueKind":"frozen","noAlias":true,"transitiveMixedData":false}}
function Component(props) {
  const x = MyCustomHook(props.a);
  return <div>{x}</div>;
}
