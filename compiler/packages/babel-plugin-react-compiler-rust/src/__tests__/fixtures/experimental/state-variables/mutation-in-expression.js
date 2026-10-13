// @enableStateVariables @flow
// A mutation that is part of an expression whose value nothing uses, and a
// path through a type cast.
function Selection({id, enabled}) {
  let selected = new Set();
  let draft = {};
  return (
    <>
      <button onClick={() => { selected.has(id) ? selected.delete(id) : selected.add(id); }}>toggle</button>
      <button onClick={() => { enabled && selected.clear(); }}>clear</button>
      <button onClick={() => { (draft: any).title = id; }}>title</button>
      {selected.size} {draft.title}
    </>
  );
}
