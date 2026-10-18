
## Input

```javascript
// @enableContextSelectors @enableContextKeySpecialization:false @compilationMode:"infer"
import {createContext, useContext} from 'react';
const Context = createContext(null);
export function useRecord(id) {
  return useContext(Context)[id];
}

```

## Code

```javascript
import { c as _c, unstable_useContextPaths } from "react/compiler-runtime"; // @enableContextSelectors @enableContextKeySpecialization:false @compilationMode:"infer"
import { createContext, useContext } from "react";
const Context = createContext(null);
export function useRecord(id) {
  const $ = _c(2);
  let t0;
  if ($[0] !== id) {
    t0 = [[0, id]];
    $[0] = id;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  return unstable_useContextPaths(Context, t0)[id];
}

```
      