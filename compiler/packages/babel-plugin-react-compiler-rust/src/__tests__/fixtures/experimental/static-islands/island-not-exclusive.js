// @enableStaticIslands
// Both branches render a <div> at the same position: React keeps the <div>'s
// DOM node when the branch changes, so neither is wrapped (an island has
// another type), and their text-only children are too small. A subtree whose
// element is passed to a component is not at a fixed position either.
function Panel({expanded, content}) {
  return (
    <Frame
      header={
        <div>
          <h2>Title</h2>
          <p>Subtitle</p>
        </div>
      }>
      {expanded ? (
        <div className="expanded">
          <p>{content}</p>
          <p>More</p>
        </div>
      ) : (
        <div className="collapsed">
          <p>{content}</p>
          <p>Less</p>
        </div>
      )}
    </Frame>
  );
}

function Frame({header, children}) {
  const ref = useRef(null);
  return (
    <div ref={ref}>
      {header}
      {children}
    </div>
  );
}
