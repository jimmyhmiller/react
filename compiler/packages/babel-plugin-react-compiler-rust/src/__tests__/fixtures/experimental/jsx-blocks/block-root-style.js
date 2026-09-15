// @enableJsxBlocks
// The root of a block may have a style: React DOM reads it from the block's
// values where it reads a host component's style after rendering (revealing
// a suspended tree, view transitions).
function Box({color}) {
  return (
    <div style={{color}}>
      <span>a</span>
    </div>
  );
}
