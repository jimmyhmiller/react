// @enableStaticIslands
// Callout and Note call no hooks and only render static elements, so an
// element of Callout is static and wrapped where it is rendered (not inside
// Callout or Note, where islands would be nested in their callers' islands).
// Counter calls a hook, so the section holding it is not, but its static
// children are.
function Note({children}) {
  return <aside className="note">{children}</aside>;
}

function Callout({title, children}) {
  return (
    <div className="callout">
      <strong>{title}</strong>
      <Note>{children}</Note>
    </div>
  );
}

function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}

function Docs({text}) {
  return (
    <section>
      <Callout title="Tip">
        <p>{text}</p>
      </Callout>
      <Counter />
      <ul>
        <li>one</li>
        <li>two</li>
      </ul>
    </section>
  );
}
