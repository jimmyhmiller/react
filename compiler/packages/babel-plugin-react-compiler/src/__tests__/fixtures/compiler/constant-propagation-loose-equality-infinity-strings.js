import {Stringify} from 'shared-runtime';

function foo() {
  return (
    <Stringify
      value={[
        'inf' == 1 / 0,
        '-inf' == -1 / 0,
        'INFINITY' == 1 / 0,
        'infinity' == 1 / 0,
        'Infinity' == 1 / 0,
        '-Infinity' == -1 / 0,
        '12' == 12,
      ]}
    />
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: foo,
  params: [],
  isComponent: false,
};
