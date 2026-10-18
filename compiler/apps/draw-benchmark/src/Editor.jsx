import { StateProvider, useEntity, useDispatch, SnapshotButton } from '@state';
import { fields } from './model';

function Entity({ id }) {
  const entity = useEntity(id);
  const dispatch = useDispatch();
  if (!entity) return null;
  const { x, y, width, height, type, text } = entity;
  const style = { left: x, top: y, width, height };
  return <div data-entity={id} className={`shape ${type}`} style={style} role="button" tabIndex={0} aria-label={`${type} ${id}`} onClick={() => dispatch({ type: 'select', id })} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); dispatch({ type: 'select', id }); } }}>{type === 'text' ? text : null}</div>;
}
function Artboard() {
  const { ids } = useEntity('$document');
  return <div className="artboard" id="artboard" aria-label="Drawing artboard">{ids.map(id => <Entity key={id} id={id} />)}</div>;
}
function InspectorFields({ id }) {
  const entity = useEntity(id);
  const dispatch = useDispatch();
  if (!entity) return null;
  return <><p className="selected">{id} / {entity.type}</p><div className="fields">{fields.map(field => <label key={field}>{field}<input id={`field-${field}`} type="number" step="any" min={field === 'width' || field === 'height' ? 0.001 : undefined} value={entity[field]} onInput={event => {
    const value = event.currentTarget.valueAsNumber;
    if (Number.isFinite(value) && (!['width', 'height'].includes(field) || value > 0)) dispatch({ type: 'edit', field, value });
  }} /></label>)}</div>{entity.type === 'text' && <label>Label<input id="field-text" value={entity.text} onInput={event => dispatch({ type: 'edit', field: 'text', value: event.currentTarget.value })} /></label>}</>;
}
function Inspector() {
  const { selected, ids } = useEntity('$document');
  const dispatch = useDispatch();
  return <aside><h2>Objects</h2><div className="tools"><button id="add-box" onClick={() => dispatch({ type: 'add', kind: 'box' })}>＋ Box</button><button id="add-text" onClick={() => dispatch({ type: 'add', kind: 'text' })}>T Text</button></div><p className="muted">{ids.length.toLocaleString()} objects on the artboard</p><hr /><h2>Properties</h2>{selected ? <InspectorFields id={selected} /> : <p className="muted">Add an object or click one to edit it.</p>}<button id="reset" className="reset" onClick={() => dispatch({ type: 'reset' })}>Clear artboard</button><SnapshotButton /></aside>;
}
function Revision() {
  const { revision } = useEntity('$clock');
  return <span id="revision" data-revision={revision}>{revision.toLocaleString()} committed actions</span>;
}
export default function Editor() {
  return <StateProvider><div className="editor"><div className="canvas-wrap"><div className="canvas-caption"><span>ARTBOARD / 640 × 540</span><Revision /></div><Artboard /></div><Inspector /></div></StateProvider>;
}
