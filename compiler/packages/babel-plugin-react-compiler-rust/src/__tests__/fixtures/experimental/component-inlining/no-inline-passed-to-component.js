// @enableComponentInlining
// Inspect can observe the element's type, so an element passed to a
// component that is not itself inlined must not be inlined.
import {useState} from 'react';

function Label({text}) {
  return <span>{text}</span>;
}

function Inspect({content}) {
  const [prefix] = useState('type:');
  return (
    <div>
      {prefix}
      {typeof content.type}
      {content}
    </div>
  );
}

function App() {
  return <Inspect content={<Label text="a" />} />;
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{}],
};
