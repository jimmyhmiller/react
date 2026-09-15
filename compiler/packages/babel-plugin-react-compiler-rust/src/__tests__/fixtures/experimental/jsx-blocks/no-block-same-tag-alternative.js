// @enableJsxBlocks
// Both branches render a <div> at the same position. React keeps the <div>'s
// DOM node when the branch changes; a block (a different type) would be
// remounted, so neither element becomes a block.
function Panel({expanded, title}) {
  return (
    <section>
      {expanded ? (
        <div className="expanded">
          <b>{title}</b>
        </div>
      ) : (
        <div>{title}</div>
      )}
    </section>
  );
}
