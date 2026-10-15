// @enableStateVariables

// Initializers and assignments preserve callable values; React must not call
// them as lazy initializers or functional updaters.
export function FunctionState({initial, next, observe}) {
  let value = initial;
  return (
    <button onClick={() => {
      value = next;
      observe(value);
    }}>
      {typeof value}
    </button>
  );
}

export function InlineFunctionState() {
  let value = () => 'initial';
  return <button onClick={() => { value = () => 'next'; }}>{value()}</button>;
}
