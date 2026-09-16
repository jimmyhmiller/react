// @enableTreatRefLikeIdentifiersAsRefs @validateRefAccessDuringRender

// `höheRef` is a legal JS identifier but is NOT ref-like per the TS
// `RefLikeNameRE` (/^(?:[a-zA-Z$_][a-zA-Z$_0-9]*)Ref$|^ref$/), because `ö` is
// not in [a-zA-Z$_0-9]. So `höheRef.current` is an ordinary property read and
// may be accessed during render.
function Component(props) {
  const höheRef = {current: props.value};
  return <div>{höheRef.current}</div>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{value: 42}],
};
