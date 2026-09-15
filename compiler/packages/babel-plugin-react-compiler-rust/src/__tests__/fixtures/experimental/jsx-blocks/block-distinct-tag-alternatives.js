// @enableJsxBlocks
// The <p>'s only alternative is a <span>, so it becomes a block. The <div>'s
// alternative is the value of `loading`, a prop that could itself be a <div>
// element, so the <div> does not; a comparison (such as `count > 0`) would be
// known to be a primitive.
function Status({loading, error, message, count}) {
  return (
    <main>
      {loading && (
        <div className="spinner">
          <i>loading</i>
        </div>
      )}
      {count > 0 && (
        <div className="count">
          <b>{count}</b>
        </div>
      )}
      {error ? (
        <p className="error">
          <b>{message}</b>
        </p>
      ) : (
        <span>ok</span>
      )}
    </main>
  );
}
