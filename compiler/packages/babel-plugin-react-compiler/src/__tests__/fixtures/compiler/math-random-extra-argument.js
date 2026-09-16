import {Stringify} from 'shared-runtime';

function Component({value}) {
  const obj = {value};
  const r = Math.random(obj);
  return <Stringify obj={obj} hasNumber={typeof r === 'number'} />;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{value: 42}],
};
