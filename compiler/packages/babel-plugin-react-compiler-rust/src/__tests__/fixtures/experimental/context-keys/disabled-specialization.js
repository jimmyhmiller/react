// @enableContextSelectors @enableContextKeySpecialization:false @compilationMode:"infer"
import {createContext, useContext} from 'react';
const Context = createContext(null);
export function useRecord(id) {
  return useContext(Context)[id];
}
