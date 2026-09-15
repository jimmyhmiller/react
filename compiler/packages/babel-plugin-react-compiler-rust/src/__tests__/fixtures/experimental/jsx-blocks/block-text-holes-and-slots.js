// @enableJsxBlocks
function Count({count, children}) {
  return (
    <span className="todo-count">
      <strong>{count + 0}</strong> {`items left`} {count > 1 && 'many'}
      {children}
    </span>
  );
}
