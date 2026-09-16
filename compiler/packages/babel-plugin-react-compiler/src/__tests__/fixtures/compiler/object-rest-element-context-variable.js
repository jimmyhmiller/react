import {Stringify} from 'shared-runtime';

function Component({a, ...rest}) {
  const update = () => {
    rest = {...rest, updated: true};
  };
  update();
  return <Stringify a={a} rest={rest} />;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{a: 1, b: 2}],
};
