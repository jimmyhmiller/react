// @enableContextSelectors
// The component reads `user.name` in render, `dispatch` in an event handler and
// `settings.locale` in an effect: each is a selected path. A change of any
// other value of the context does not render it.
import {createContext, useContext, useEffect} from 'react';

const AppContext = createContext(null);

function Greeting() {
  const {user, dispatch, settings} = useContext(AppContext);
  useEffect(() => {
    document.documentElement.lang = settings.locale;
  }, [settings]);
  return (
    <button onClick={() => dispatch({type: 'wave'})}>Hello {user.name}</button>
  );
}
