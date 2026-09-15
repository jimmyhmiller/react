// @enableJsxBlocks
// Children that React renders as nothing stay in the template as `null`: they
// have no DOM node, but count as children for the tree positions (useId) of
// their siblings, so a block hydrates the HTML of the equivalent host elements.
function Greeting({name, children}) {
  return (
    <div>
      {null}
      <span>
        {false}
        {name}
      </span>
      {''}
      {children}
    </div>
  );
}
