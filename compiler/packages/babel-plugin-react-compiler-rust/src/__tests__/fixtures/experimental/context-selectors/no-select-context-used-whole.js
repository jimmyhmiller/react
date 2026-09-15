// @enableContextSelectors
// The context value itself is passed to a component, which can read anything
// from it, so the read is not selected.
import {createContext, useContext} from 'react';

const ThemeContext = createContext(null);

function Panel({children}) {
  const theme = useContext(ThemeContext);
  return <Frame theme={theme}>{children}</Frame>;
}
