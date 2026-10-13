// @enableStateVariables
function List({items}) {
  let n = 0;
  const rows = items.map(item => {
    n++;
    return <li key={n}>{item}</li>;
  });
  return (
    <ul
      onClick={() => {
        n = 0;
      }}>
      {rows}
    </ul>
  );
}
