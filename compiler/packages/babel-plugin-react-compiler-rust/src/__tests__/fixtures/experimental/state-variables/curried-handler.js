// @enableStateVariables
// A function that returns a handler is called during render; the handler that
// it returns runs after render.
function Tabs() {
  let selected = null;
  const select = id => () => {
    selected = id;
  };
  return (
    <>
      <button onClick={select(1)}>one</button>
      <button onClick={select(2)}>two</button>
      {selected}
    </>
  );
}
