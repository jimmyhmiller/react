// @enableComponentInlining
import {useState} from 'react';

function Counter({initial}) {
  const [count] = useState(initial);
  return <span>{count}</span>;
}

function App() {
  return (
    <div>
      <Counter initial={1} />
    </div>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: App,
  params: [{}],
};
