export const fields = ['width', 'height', 'x', 'y'];
export function initialState() {
  return { $document: { ids: [], selected: null }, $clock: { revision: 0 } };
}
// A patch describes the few changed records. The Context adapter copies the whole map.
export function patchFor(state, action) {
  const doc = state.$document;
  const clock = { revision: state.$clock.revision + 1 };
  if (action.type === 'add') {
    const id = `shape-${doc.ids.length}`;
    return {
      [id]: { id, type: action.kind, x: 0, y: 0, width: 1, height: 1, text: action.kind === 'text' ? 'React' : '' },
      $document: { ids: [...doc.ids, id], selected: id },
      $clock: clock,
    };
  }
  if (action.type === 'select') {
    if (!state[action.id]) throw new Error(`Missing entity ${action.id}`);
    return { $document: { ...doc, selected: action.id }, $clock: clock };
  }
  if (action.type === 'edit') {
    if (!doc.selected) throw new Error('No selected entity');
    if (![...fields, 'text'].includes(action.field)) throw new Error('Invalid field');
    if (action.field !== 'text' && (!Number.isFinite(action.value) || (['width', 'height'].includes(action.field) && action.value <= 0))) throw new Error('Invalid numeric value');
    return { [doc.selected]: { ...state[doc.selected], [action.field]: action.value }, $clock: clock };
  }
  throw new Error(`Unknown action ${action.type}`);
}
export function reduce(state, action) {
  return action.type === 'reset' ? initialState() : { ...state, ...patchFor(state, action) };
}
