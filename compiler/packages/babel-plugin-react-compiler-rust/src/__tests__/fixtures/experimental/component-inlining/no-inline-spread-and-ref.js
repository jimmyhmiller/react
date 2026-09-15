// @enableComponentInlining
import {useRef} from 'react';

function Label({text}) {
  return <span>{text}</span>;
}

function App(props) {
  const ref = useRef(null);
  return (
    <div>
      <Label {...props} />
      <Label text="b" ref={ref} />
    </div>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{text: 'a'}],
};
