
## Input

```javascript
// @enableContextSelectors
// The context value itself is passed to a component, which can read anything
// from it, so the read is not selected.
import {createContext, useContext} from 'react';

const ThemeContext = createContext(null);

function Panel({children}) {
  const theme = useContext(ThemeContext);
  return <Frame theme={theme}>{children}</Frame>;
}

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableContextSelectors
// The context value itself is passed to a component, which can read anything
// from it, so the read is not selected.
import { createContext, useContext } from "react";

const ThemeContext = createContext(null);

function Panel(t0) {
  const $ = _c(3);
  const { children } = t0;
  const theme = useContext(ThemeContext);
  let t1;
  if ($[0] !== children || $[1] !== theme) {
    t1 = <Frame theme={theme}>{children}</Frame>;
    $[0] = children;
    $[1] = theme;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  return t1;
}

```
      