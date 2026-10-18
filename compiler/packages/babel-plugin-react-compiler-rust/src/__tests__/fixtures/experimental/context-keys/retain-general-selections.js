// @enableContextSelectors @enableContextKeySpecialization @compilationMode:"infer"
import {createContext, useContext} from 'react';
const Context = createContext(null);
export function NestedPath() {
  return <span>{useContext(Context).user.name}</span>;
}
export function MultipleKeys() {
  const value = useContext(Context);
  return <span>{value.first}{value.last}</span>;
}
export function Equality({id}) {
  return <span>{useContext(Context).selectedId === id}</span>;
}
export function WholeValue() {
  const value = useContext(Context);
  return <Consumer value={value} />;
}
