
## Input

```javascript
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

```

## Code

```javascript
import {
  c as _c,
  unstable_registerStoreHook,
  unstable_selectHookPaths,
  unstable_startSelectedHook,
} from "react/compiler-runtime"; // @enableContextSelectors @compilationMode:"infer"
// React Redux's `useSelector` returns the selection of the store's state, so
// the module registers it after its import, and reads of its value are
// selected.
import { useDispatch, useSelector } from "react-redux";
unstable_registerStoreHook(useSelector);

export function Row(t0) {
  const $ = _c(11);
  const { id } = t0;
  let t1;
  if ($[0] !== id) {
    t1 = [
      [0, "labels", id],
      [1, id, "selectedId"],
    ];
    $[0] = id;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const _selectedHook = unstable_startSelectedHook(useSelector);
  const t2 = useSelector(_temp);
  unstable_selectHookPaths(_selectedHook, t2, useSelector, t1);
  const ui = t2;
  const dispatch = useDispatch();

  const t3 = ui.selectedId === id ? "danger" : "";
  let t4;
  if ($[2] !== dispatch || $[3] !== id) {
    t4 = () => dispatch({ type: "select", id });
    $[2] = dispatch;
    $[3] = id;
    $[4] = t4;
  } else {
    t4 = $[4];
  }
  const t5 = ui.labels[id];
  let t6;
  if ($[5] !== t4 || $[6] !== t5) {
    t6 = <td onClick={t4}>{t5}</td>;
    $[5] = t4;
    $[6] = t5;
    $[7] = t6;
  } else {
    t6 = $[7];
  }
  let t7;
  if ($[8] !== t3 || $[9] !== t6) {
    t7 = <tr className={t3}>{t6}</tr>;
    $[8] = t3;
    $[9] = t6;
    $[10] = t7;
  } else {
    t7 = $[10];
  }
  return t7;
}
function _temp(state) {
  return state.ui;
}

```
      