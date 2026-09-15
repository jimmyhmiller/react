// @enableJsxBlocks
// An element passed to a component can be rendered anywhere by that component,
// next to other elements with the same tag, so it does not become a block.
function Page({title, Wrapper}) {
  return (
    <Wrapper>
      <div className="title">
        <b>{title}</b>
      </div>
    </Wrapper>
  );
}
