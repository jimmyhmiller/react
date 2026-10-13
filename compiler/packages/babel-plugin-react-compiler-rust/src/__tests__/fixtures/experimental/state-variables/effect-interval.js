// @enableStateVariables
import {useEffect} from 'react';

// The interval callback is created once. It updates the state with an updater,
// so it does not need the current value of `seconds`.
function Timer() {
  let seconds = 0;
  useEffect(() => {
    const id = setInterval(() => {
      seconds++;
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return <span>{seconds}</span>;
}
