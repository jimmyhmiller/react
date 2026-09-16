const data = window.__ADD_ROWS_DEMO__;
const variants = new Map(data.variants.map(variant => [variant.id, variant]));
const baseline = variants.get('no-compiler');
const ROW_TARGET = 2000;
const FEATURES = [
  {
    id: 'inlining',
    label: 'Component inlining',
    detail: 'Fuse small component calls',
  },
  {id: 'blocks', label: 'JSX blocks', detail: 'Precompile host DOM structure'},
  {id: 'lists', label: 'List item caches', detail: 'Memoize each rendered row'},
  {
    id: 'incremental',
    label: 'Incremental map',
    detail: 'Visit only changed items',
  },
];

let activeVariant = baseline;
let compilerEnabled = false;
let enabledFeatures = {
  inlining: false,
  blocks: false,
  lists: false,
  incremental: false,
};
let codeMode = 'source';
let running = false;
let frameLoadToken = 0;

const elements = {
  featureToggles: document.querySelector('.feature-toggles'),
  frame: document.getElementById('app-frame'),
  run: document.getElementById('run-button'),
  reset: document.getElementById('reset-button'),
  referenceTime: document.getElementById('reference-time'),
  referenceRange: document.getElementById('reference-range'),
  liveTime: document.getElementById('live-time'),
  status: document.getElementById('run-status'),
  rowCount: document.getElementById('row-count'),
  speedup: document.getElementById('speedup'),
  progress: document.getElementById('progress-bar'),
  source: document.getElementById('source-code'),
  codeTitle: document.getElementById('code-title'),
  filename: document.getElementById('code-filename'),
  previewTitle: document.getElementById('preview-title'),
  description: document.getElementById('variant-description'),
  copy: document.getElementById('copy-button'),
  measurementNote: document.getElementById('measurement-note'),
  matrixBody: document.getElementById('matrix-body'),
};

function formatMs(value) {
  return value == null ? '—' : `${value.toFixed(1)} ms`;
}

function featureKey(features) {
  return FEATURES.map(feature => (features[feature.id] ? '1' : '0')).join('');
}

const combinations = new Map(
  data.variants
    .filter(variant => variant.features !== null)
    .map(variant => [featureKey(variant.features), variant])
);

function renderControls() {
  elements.featureToggles.replaceChildren(
    ...FEATURES.map(feature => {
      const label = document.createElement('label');
      label.className = 'feature-toggle';
      label.dataset.feature = feature.id;
      label.innerHTML = `<span><strong>${feature.label}</strong><small>${feature.detail}</small></span><input type="checkbox"><i aria-hidden="true"></i>`;
      label.querySelector('input').addEventListener('change', event => {
        enabledFeatures[feature.id] = event.target.checked;
        if (feature.id === 'lists' && !event.target.checked) {
          enabledFeatures.incremental = false;
        }
        selectConfiguration();
      });
      return label;
    })
  );
  document.querySelectorAll('.mode-button').forEach(button => {
    button.addEventListener('click', () => {
      compilerEnabled = button.dataset.compiler === 'true';
      selectConfiguration();
    });
  });
}

function renderMatrix() {
  const compilerVariants = data.variants.filter(
    variant => variant.features !== null
  );
  elements.matrixBody.replaceChildren(
    ...compilerVariants.map(variant => {
      const row = document.createElement('tr');
      row.dataset.variant = variant.id;
      row.tabIndex = 0;
      const cells = FEATURES.map(feature =>
        variant.features[feature.id]
          ? '<td class="enabled-mark" aria-label="enabled">●</td>'
          : '<td class="disabled-mark" aria-label="disabled">—</td>'
      ).join('');
      const speedup = baseline.referenceMedian / variant.referenceMedian;
      row.innerHTML = `<th>${variant.label}</th>${cells}<td>${formatMs(variant.referenceMedian)}</td><td>${Number.isFinite(speedup) ? `${speedup.toFixed(2)}×` : '—'}</td>`;
      const select = () => {
        compilerEnabled = true;
        enabledFeatures = {...variant.features};
        selectConfiguration();
        document
          .querySelector('.controls')
          .scrollIntoView({behavior: 'smooth'});
      };
      row.addEventListener('click', select);
      row.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select();
        }
      });
      return row;
    })
  );
}

function updateControls() {
  document.querySelectorAll('.mode-button').forEach(button => {
    const active = (button.dataset.compiler === 'true') === compilerEnabled;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
    button.disabled = running;
  });
  document.querySelectorAll('.feature-toggle').forEach(label => {
    const feature = label.dataset.feature;
    const input = label.querySelector('input');
    const dependencyMissing =
      feature === 'incremental' && !enabledFeatures.lists;
    input.checked = enabledFeatures[feature];
    input.disabled = running || !compilerEnabled || dependencyMissing;
    label.classList.toggle(
      'unavailable',
      !compilerEnabled || dependencyMissing
    );
  });
}

function updateCode() {
  const generated = codeMode === 'generated';
  elements.source.textContent = generated
    ? activeVariant.generated
    : activeVariant.source;
  elements.codeTitle.textContent = generated
    ? `${activeVariant.label} output`
    : 'Shared source';
  elements.filename.textContent = generated
    ? 'AddRowsApp.compiled.js'
    : 'AddRowsApp.jsx';
  document.querySelectorAll('.code-tab').forEach(tab => {
    const active = tab.dataset.code === codeMode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
}

function resetMetrics() {
  elements.liveTime.textContent = 'Not run';
  elements.status.textContent = 'Ready';
  elements.rowCount.textContent = `0 / ${ROW_TARGET.toLocaleString()}`;
  elements.progress.style.width = '0%';
}

function selectConfiguration() {
  if (running) return;
  const variant = compilerEnabled
    ? combinations.get(featureKey(enabledFeatures))
    : baseline;
  if (!variant)
    throw new Error('No build exists for this optimization combination.');
  activeVariant = variant;
  updateControls();
  document.querySelectorAll('.matrix-table tbody tr').forEach(row => {
    row.classList.toggle('active', row.dataset.variant === variant.id);
  });
  elements.referenceTime.textContent = formatMs(variant.referenceMedian);
  elements.referenceRange.textContent =
    variant.referenceP25 == null
      ? 'No recorded benchmark'
      : `p25–p75 ${variant.referenceP25.toFixed(1)}–${variant.referenceP75.toFixed(1)} ms`;
  const speedup = baseline.referenceMedian / variant.referenceMedian;
  elements.speedup.textContent = Number.isFinite(speedup)
    ? `${speedup.toFixed(2)}×`
    : '—';
  elements.previewTitle.textContent = variant.label;
  elements.description.textContent = variant.description;
  resetMetrics();
  updateCode();
  loadFrame();
}

function loadFrame() {
  const token = ++frameLoadToken;
  elements.status.textContent = 'Loading bundle…';
  elements.frame.onload = () => {
    if (token !== frameLoadToken) return;
    elements.status.textContent = 'Ready';
    const body = elements.frame.contentDocument?.body;
    if (body) body.style.minWidth = '0';
  };
  elements.frame.src = `${activeVariant.appUrl}?demo=${token}`;
}

async function addRows() {
  if (running) return;
  const doc = elements.frame.contentDocument;
  const addButton = doc?.getElementById('add-row');
  if (!addButton) {
    elements.status.textContent = 'Bundle is still loading';
    return;
  }
  running = true;
  elements.run.disabled = true;
  updateControls();
  resetMetrics();
  elements.liveTime.textContent = 'Running…';
  const view = elements.frame.contentWindow;
  const started = performance.now();
  try {
    for (let i = 0; i < ROW_TARGET; i++) {
      addButton.click();
      await null;
      if ((i + 1) % 25 === 0 || i === ROW_TARGET - 1) {
        elements.rowCount.textContent = `${(i + 1).toLocaleString()} / ${ROW_TARGET.toLocaleString()}`;
        elements.progress.style.width = `${((i + 1) / ROW_TARGET) * 100}%`;
        elements.status.textContent = `Committing row ${(i + 1).toLocaleString()}`;
      }
    }
    await new Promise(resolve =>
      view.requestAnimationFrame(() => setTimeout(resolve, 0))
    );
    const elapsed = performance.now() - started;
    const count = doc.querySelectorAll('#row-list li').length;
    elements.liveTime.textContent = formatMs(elapsed);
    elements.rowCount.textContent = `${count.toLocaleString()} / ${ROW_TARGET.toLocaleString()}`;
    elements.status.textContent =
      count === ROW_TARGET
        ? 'Complete'
        : `Expected ${ROW_TARGET}, found ${count}`;
  } catch (error) {
    elements.liveTime.textContent = 'Failed';
    elements.status.textContent = error.message;
  } finally {
    running = false;
    elements.run.disabled = false;
    updateControls();
  }
}

renderControls();
renderMatrix();
document.querySelectorAll('.code-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    codeMode = tab.dataset.code;
    updateCode();
  });
});
elements.copy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(elements.source.textContent);
  elements.copy.textContent = 'Copied';
  setTimeout(() => (elements.copy.textContent = 'Copy'), 1200);
});
elements.run.addEventListener('click', addRows);
elements.reset.addEventListener('click', () => {
  if (!running) {
    resetMetrics();
    loadFrame();
  }
});

const date = data.measuredAt
  ? new Date(data.measuredAt).toLocaleDateString()
  : 'unknown date';
elements.measurementNote.textContent = data.iterations
  ? `Reference: median of ${data.iterations} runs in Chromium ${data.browser}, measured ${date}.`
  : 'Reference benchmark data is unavailable.';
selectConfiguration();
