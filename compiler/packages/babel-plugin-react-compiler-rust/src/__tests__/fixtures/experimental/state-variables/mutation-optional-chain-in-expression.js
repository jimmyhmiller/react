// @enableStateVariables
// An optional chain that is part of another expression, whose value nothing
// uses.
function List({item, enabled}) {
  let items = [];
  return (
    <>
      <button onClick={() => { enabled && items?.push(item); }}>add</button>
      <button onClick={() => { enabled ? items?.pop() : items?.reverse(); }}>undo</button>
      {items?.length}
    </>
  );
}
