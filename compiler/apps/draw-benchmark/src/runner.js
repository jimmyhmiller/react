import { flushSync } from 'react-dom';
import { trace, shapes, TRACE_ID } from './trace';
import { initialState, reduce } from './model';

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
const byId = id => document.getElementById(id);
const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
function perform(action) {
  // Exercise the real controls and React event handlers. No direct reducer calls here.
  if (action.type === 'add') byId(`add-${action.kind}`).click();
  else {
    const input = byId(`field-${action.field}`);
    setValue.call(input, String(action.value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
function reset() { flushSync(() => byId('reset').click()); }
function snapshot() {
  byId('snapshot').click();
  return structuredClone(window.__drawSnapshot);
}
const canonical = value => JSON.stringify(value, Object.keys(value).sort());
function assert(condition, message) { if (!condition) throw new Error(message); }
function checkFinal() {
  const state = snapshot();
  const expected = trace.reduce(reduce, initialState());
  // Compare nested values without discarding object keys, independent of map insertion order.
  assert(Object.keys(state).length === Object.keys(expected).length, 'Record count mismatch');
  for (const key of Object.keys(expected)) assert(canonical(state[key]) === canonical(expected[key]), `Final state mismatch: ${key}`);
  const nodes = [...byId('artboard').children];
  assert(nodes.length === shapes.length, 'DOM shape count mismatch');
  shapes.forEach((shape, i) => {
    const node = nodes[i];
    assert(node.dataset.entity === `shape-${i}`, `Wrong DOM order at ${i}`);
    assert(node.className === `shape ${shape.type}`, `Wrong primitive at ${i}`);
    for (const [field, css] of Object.entries({ x: 'left', y: 'top', width: 'width', height: 'height' })) {
      assert(Number.parseFloat(node.style[css]) === shape[field], `Wrong DOM ${field} at ${i}`);
    }
    assert(node.textContent === (shape.type === 'text' ? 'React' : ''), `Wrong label at ${i}`);
  });
  assert(byId('revision').dataset.revision === '5000', 'Final revision mismatch');
  return { state, html: byId('root').innerHTML, dom: [...byId('artboard').children].map(node => ({id: node.dataset.entity, type: node.className, x: node.style.left, y: node.style.top, width: node.style.width, height: node.style.height, text: node.textContent})) };
}
function runTrial() {
  reset();
  // This entire loop is one JavaScript task. No awaits, layout reads, observers,
  // Profiler, rendering instrumentation, or frame callbacks inside the interval.
  const start = performance.now();
  for (const action of trace) flushSync(() => perform(action));
  const elapsedMs = performance.now() - start;
  return elapsedMs;
}
function verify() {
  reset();
  const clock = byId('revision');
  const observer = new MutationObserver(() => {});
  observer.observe(byId('root'), { attributes: true, subtree: true, childList: true, characterData: true });
  let verifiedCommits = 0;
  try {
    for (let i = 0; i < trace.length; i++) {
      const action = trace[i];
      flushSync(() => perform(action));
      const mutations = observer.takeRecords();
      const clockChanges = mutations.filter(record => record.target === clock && record.attributeName === 'data-revision');
      assert(clock.dataset.revision === String(i + 1), `Action ${i} did not commit synchronously`);
      assert(clockChanges.length === 1, `Action ${i} did not produce exactly one revision commit`);
      const entity = byId('artboard').lastElementChild;
      if (action.type === 'add') assert(entity.dataset.entity === `shape-${i / 5}`, `Add failed at ${i}`);
      else {
        const css = { x: 'left', y: 'top', width: 'width', height: 'height' }[action.field];
        assert(parseFloat(entity.style[css]) === action.value, `Action ${i} failed to update the shape DOM`);
      }
      verifiedCommits++;
    }
  } finally { observer.disconnect(); }
  const { state, html, dom } = checkFinal();
  return { verifiedCommits, entities: shapes.length, state, html, dom };
}
const paintGap = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
let busy = false;
async function runSuite({ warmups = 2, trials = 5, onProgress = () => {} } = {}) {
  if (busy) throw new Error('A suite is already running');
  if (!Number.isInteger(warmups) || warmups < 0 || warmups > 10 || !Number.isInteger(trials) || trials < 1 || trials > 20) throw new Error('Warmups must be 0–10 and trials 1–20');
  busy = true;
  try {
    const warmupMs = [], rawMs = [];
    for (let i = 0; i < warmups + trials; i++) {
      onProgress(`${i < warmups ? 'Warmup' : 'Trial'} ${i < warmups ? i + 1 : i - warmups + 1} of ${i < warmups ? warmups : trials}`);
      await paintGap();
      const elapsed = runTrial();
      (i < warmups ? warmupMs : rawMs).push(elapsed);
      checkFinal(); // Always outside timing; no instrumentation in measured commits.
    }
    return { variant: __VARIANT__, production: import.meta.env.PROD, trace: TRACE_ID, actions: trace.length, entities: shapes.length, warmupMs, rawMs, medianMs: median(rawMs), minMs: Math.min(...rawMs), maxMs: Math.max(...rawMs), userAgent: navigator.userAgent, timestamp: new Date().toISOString(), hardwareConcurrency: navigator.hardwareConcurrency, viewport: { width: innerWidth, height: innerHeight }, timing: 'synchronous UI events + React render/commit; excludes subsequent layout/paint' };
  } finally { busy = false; }
}
export function installBenchmark() {
  window.drawBench = { runTrial, runSuite, verify, snapshot, checkFinal, reset, trace, variant: __VARIANT__, production: import.meta.env.PROD };
  byId('variant').textContent = __VARIANT_LABEL__;
  byId('build-note').textContent = import.meta.env.PROD ? 'Production build' : 'Development build — do not compare timings';
  let latest;
  const controls = ['run', 'verify', 'warmups', 'trials'];
  function lock(locked) { controls.forEach(id => { byId(id).disabled = locked; }); }
  byId('run').onclick = async () => {
    lock(true);
    try {
      latest = await runSuite({ warmups: Number(byId('warmups').value), trials: Number(byId('trials').value), onProgress: text => { byId('status').textContent = `${text} — please wait…`; } });
      byId('results').replaceChildren();
      const strong = document.createElement('strong'); strong.textContent = `${latest.medianMs.toFixed(1)} ms`;
      byId('results').append(strong, `median · raw trials: ${latest.rawMs.map(n => n.toFixed(1)).join(', ')} ms`);
      byId('status').textContent = 'Complete. Final state and DOM checked after every trial. Layout and paint occur after each timed loop.';
      byId('download').disabled = false;
    } catch (error) { byId('status').textContent = `Failed: ${error.message}`; }
    finally { lock(false); }
  };
  byId('verify').onclick = async () => {
    lock(true); byId('status').textContent = 'Checking every action’s synchronous DOM commit…';
    try { await paintGap(); const result = verify(); byId('status').textContent = `Verified ${result.verifiedCommits.toLocaleString()} individual commits and ${result.entities.toLocaleString()} final DOM objects. Verification is not a timing result.`; }
    catch (error) { byId('status').textContent = `Failed: ${error.message}`; }
    finally { lock(false); }
  };
  byId('download').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(latest, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `draw-${__VARIANT__}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  };
}
