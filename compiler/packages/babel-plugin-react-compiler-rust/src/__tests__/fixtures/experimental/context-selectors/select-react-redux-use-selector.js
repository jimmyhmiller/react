// @enableContextSelectors @compilationMode:"infer"
// React Redux's `useSelector` returns the selection of the store's state, so
// the module registers it after its import, and reads of its value are
// selected.
import {useDispatch, useSelector} from 'react-redux';

export function Row({id}) {
  const ui = useSelector(state => state.ui);
  const dispatch = useDispatch();
  return (
    <tr className={ui.selectedId === id ? 'danger' : ''}>
      <td onClick={() => dispatch({type: 'select', id})}>{ui.labels[id]}</td>
    </tr>
  );
}
