// @enableJsxBlocks
// Identical trees in different functions share one module-scope template.
function Primary({label, onClick}) {
  return (
    <div className="card">
      <button onClick={onClick}>{label}</button>
    </div>
  );
}

function Secondary({title, onSelect}) {
  return (
    <div className="card">
      <button onClick={onSelect}>{title}</button>
    </div>
  );
}

function Different({label}) {
  return (
    <div className="other">
      <button>{label}</button>
    </div>
  );
}
