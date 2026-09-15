// @enableContextSelectors @compilationMode:"infer"
// Hooks created by Zustand's `create` return the selection of the store's
// state, so the module registers them. Reads of their values are selected:
// a card only renders when whether it is selected or starred changes.
import {create} from 'zustand';

export const useBoardStore = create(set => ({
  selectedCardId: null,
  starred: {},
  selectCard: id => set({selectedCardId: id}),
}));

export function Card({card}) {
  const selectedCardId = useBoardStore(state => state.selectedCardId);
  const starred = useBoardStore(state => state.starred);
  const selectCard = useBoardStore(state => state.selectCard);
  const isSelected = card.id === selectedCardId;
  const isStarred = starred[card.id] === true;
  return (
    <li className={isSelected ? 'selected' : ''} onClick={() => selectCard(card.id)}>
      {isStarred ? '★' : '☆'} {card.title}
    </li>
  );
}
