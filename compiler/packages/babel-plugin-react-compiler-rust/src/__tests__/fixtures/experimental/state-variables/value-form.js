// @enableStateVariables
// A write whose value is not computed from the state by pure operators sets the
// value: a method call or a function call on the state, a call between the read
// and the write (which could write the state itself), or no read at all.
function Editor({normalize, initial}) {
  let text = initial;
  let tags = [];
  return (
    <>
      <input value={text} onChange={e => (text = e.target.value)} />
      <button onClick={() => { text = text.trim(); }}>trim</button>
      <button onClick={() => { text = normalize(text); }}>normalize</button>
      <button onClick={() => { tags = tags.concat(text); }}>tag</button>
      <button onClick={() => { text = text + normalize(''); }}>append</button>
      {tags.join(', ')}
    </>
  );
}
