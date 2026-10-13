// @enableStateVariables @enableComponentInlining
// A component with a state variable calls `useState` once compiled, so it is
// not inlined (rule C3 of component inlining). `Label` still is.
function Label({text}) {
  return <span>{text}</span>;
}

function Toggle({text}) {
  let open = false;
  return (
    <button onClick={() => { open = !open; }}>
      {text}
      {open ? '!' : ''}
    </button>
  );
}

function App({text}) {
  return (
    <div>
      <Label text={text} />
      <Toggle text={text} />
    </div>
  );
}
