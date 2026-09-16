import {Stringify} from 'shared-runtime';

function foo() {
  return (
    <Stringify
      value={[
        1 ** (0 / 0),
        (-1) ** (1 / 0),
        1 ** (-1 / 0),
        (0 / 0) ** 0,
        2 ** 3,
        2 ** (1 / 0),
      ]}
    />
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: foo,
  params: [],
  isComponent: false,
};
