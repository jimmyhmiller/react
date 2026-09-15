// @enableJsxBlocks
// Both returns render a <ul> at the component's position, so neither becomes
// a block.
function Items({compact, first, second}) {
  if (compact) {
    return (
      <ul>
        <li>{first}</li>
      </ul>
    );
  }
  return (
    <ul>
      <li>{first}</li>
      <li>{second}</li>
    </ul>
  );
}
