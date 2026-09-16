// @flow @compilationMode:"infer"
function Component(props: null) {
  return <div>{Math.max(1, 2)}</div>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [null],
};
