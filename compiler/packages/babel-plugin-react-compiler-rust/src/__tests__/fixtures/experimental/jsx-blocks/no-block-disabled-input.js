// @enableJsxBlocks
// React DOM suppresses mouse events on disabled inputs based on their props,
// so an input with `disabled` is rendered as an ordinary element.
function Field({value, onChange, disabled}) {
  return (
    <div>
      <input value={value} onChange={onChange} disabled={disabled} />
      <span>field</span>
    </div>
  );
}
