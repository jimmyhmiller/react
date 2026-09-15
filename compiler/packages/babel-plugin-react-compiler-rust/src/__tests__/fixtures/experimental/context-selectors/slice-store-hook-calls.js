// @enableContextSelectors @enableUpdateSlicing @compilationMode:"infer"
// With update slicing, every call of a custom hook is made through the
// runtime, selected or not, so that React can skip calls of store hooks whose
// arguments are unchanged. Calls with more than three arguments are made
// directly.
import {create} from 'zustand';
import {useDispatch} from 'react-redux';

export const useBoardStore = create(set => ({
  theme: 'light',
  users: [],
}));

function useMany(a, b, c, d) {
  return a + b + c + d;
}

export function Card({card}) {
  const theme = useBoardStore(state => state.theme);
  const users = useBoardStore(state => state.users);
  const dispatch = useDispatch();
  const many = useMany(1, 2, 3, 4);
  const assignee = users.find(user => user.id === card.assigneeId);
  return (
    <li className={theme === 'dark' ? 'dark' : 'light'} onClick={() => dispatch(card.id)}>
      {assignee.name} {many}
    </li>
  );
}
