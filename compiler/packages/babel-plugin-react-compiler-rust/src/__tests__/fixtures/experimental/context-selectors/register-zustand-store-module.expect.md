
## Input

```javascript
// @enableContextSelectors @compilationMode:"infer" @expectNothingCompiled
// A module that only defines stores still registers their hooks, which other
// modules call. Only `const` hooks created by the imported `create` are
// registered.
import {create} from 'zustand';
import {create as createOther} from 'other-store';

export const useCounterStore = create(set => ({
  count: 0,
  increment: () => set(state => ({count: state.count + 1})),
}));

export const useTypedStore = create()(set => ({value: 0}));

export let useReassignedStore = create(() => ({value: 0}));

export const useOtherStore = createOther(() => ({value: 0}));

export const counterStore = create(() => ({value: 0}));

```

## Code

```javascript
import { unstable_registerStoreHook } from "react/compiler-runtime"; // @enableContextSelectors @compilationMode:"infer" @expectNothingCompiled
// A module that only defines stores still registers their hooks, which other
// modules call. Only `const` hooks created by the imported `create` are
// registered.
import { create } from "zustand";
import { create as createOther } from "other-store";

export const useCounterStore = create((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));
unstable_registerStoreHook(useCounterStore);

export const useTypedStore = create()((set) => ({ value: 0 }));
unstable_registerStoreHook(useTypedStore);

export let useReassignedStore = create(() => ({ value: 0 }));

export const useOtherStore = createOther(() => ({ value: 0 }));

export const counterStore = create(() => ({ value: 0 }));

```
      