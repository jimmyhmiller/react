// @enableContextSelectors @enableContextKeySpecialization @compilationMode:"infer"
import {createContext, useContext} from 'react';
const Context = createContext(null);
export function useRecord(id) {
  return useContext(Context)[id];
}
export function StaticKey() {
  return <span>{useContext(Context).label}</span>;
}
export function NumberKey() {
  return <span>{useContext(Context)[0]}</span>;
}
