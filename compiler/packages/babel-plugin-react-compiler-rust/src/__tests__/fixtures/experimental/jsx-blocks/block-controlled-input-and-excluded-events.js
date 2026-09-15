// @enableJsxBlocks
// Controlled inputs are part of the block. Elements with enter/leave events
// are not; they are rendered in slots as ordinary elements.
function Row({checked, onChange, onEnter}) {
  return (
    <div className="row">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span onMouseEnter={onEnter}>hover</span>
      <p>static</p>
    </div>
  );
}
