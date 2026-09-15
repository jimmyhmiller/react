
## Input

```javascript
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

```

## Code

```javascript
import { c as _c, unstable_useContextPaths } from "react/compiler-runtime"; // @enableContextSelectors
// The component reads `user.name` in render, `dispatch` in an event handler and
// `settings.locale` in an effect: each is a selected path. A change of any
// other value of the context does not render it.
import { createContext, useContext, useEffect } from "react";

const AppContext = createContext(null);

function Greeting() {
  const $ = _c(10);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [
      [0, "settings"],
      [0, "dispatch"],
      [0, "user", "name"],
    ];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const { user, dispatch, settings } = unstable_useContextPaths(AppContext, t0);
  let t1;
  if ($[1] !== settings.locale) {
    t1 = () => {
      document.documentElement.lang = settings.locale;
    };
    $[1] = settings.locale;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[3] !== settings) {
    t2 = [settings];
    $[3] = settings;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  useEffect(t1, t2);
  let t3;
  if ($[5] !== dispatch) {
    t3 = () => dispatch({ type: "wave" });
    $[5] = dispatch;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  let t4;
  if ($[7] !== t3 || $[8] !== user.name) {
    t4 = <button onClick={t3}>Hello {user.name}</button>;
    $[7] = t3;
    $[8] = user.name;
    $[9] = t4;
  } else {
    t4 = $[9];
  }
  return t4;
}

```
      