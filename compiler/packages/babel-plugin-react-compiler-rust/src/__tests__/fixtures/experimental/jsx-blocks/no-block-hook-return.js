// @enableJsxBlocks
// A hook's return value is rendered wherever its caller renders it, so it does
// not become a block.
function useBadge(count) {
  return (
    <span className="badge">
      <b>{count}</b>
    </span>
  );
}

function Counter({count}) {
  const badge = useBadge(count);
  return <div>{badge}</div>;
}
