// @enableContextSelectors
// None of these hooks is registered: one returns a value derived from the
// context, one calls another hook, and one reads two contexts. Calls of them
// are still selected, but React only applies the description to registered
// hooks.
import {createContext, useContext, useState} from 'react';

const A = createContext(null);
const B = createContext(null);

export function useDerived() {
  const value = useContext(A);
  return value.enabled ? value : {enabled: false};
}

export function useWithState() {
  useState(0);
  return useContext(A);
}

export function useTwoContexts() {
  useContext(B);
  return useContext(A);
}

export function Consumer() {
  const derived = useDerived();
  const withState = useWithState();
  const two = useTwoContexts();
  return (
    <p>
      {derived.label}
      {withState.label}
      {two.label}
    </p>
  );
}
