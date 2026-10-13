// @enableStateVariables
// The compiler knows nothing about `splice` or `sort`, nor about any method of
// `items`, whose type is unknown. A call whose result is not used can only have
// been made for its effect on the receiver, so it is an update. A method that
// the built-in collections declare as read-only (`forEach`) is not, and neither
// is a call whose result is used (`slice`).
function List({initial, log}) {
  let items = initial;
  return (
    <>
      <button onClick={() => { items.splice(0, 1); }}>remove</button>
      <button onClick={() => { items.sort(); }}>sort</button>
      <button
        onClick={() => {
          items.forEach(item => log(item));
          const first = items.slice(0, 1);
          log(first);
        }}>
        log
      </button>
      {items.length}
    </>
  );
}
