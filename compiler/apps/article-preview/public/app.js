const articleNode = document.getElementById('article');
const status = document.getElementById('status');
let revision = 0;

function createWidget(id, data) {
  const shell = document.createElement('section');
  shell.className = 'widget';
  const variants = data.variantIds;
  let selected = variants[0];
  const title = document.createElement('div');
  title.className = 'widget-title';
  title.innerHTML = `<strong>Try the optimization</strong><span>Same source, ${variants.length} builds</span>`;
  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  const body = document.createElement('div');
  body.className = 'widget-body';
  const preview = document.createElement('div');
  preview.className = 'preview';
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const benchmark = document.createElement('button');
  benchmark.textContent = 'Time the 2,000-add button';
  benchmark.hidden = data.benchmark !== 'single-row';
  const reset = document.createElement('button');
  reset.textContent = 'Reset';
  const result = document.createElement('span');
  result.textContent = 'Each click adds one row.';
  toolbar.append(benchmark, reset, result);
  const frame = document.createElement('iframe');
  frame.title = `Running ${id} example`;
  preview.append(toolbar, frame);
  const comparisons = document.createElement('div');
  comparisons.className = 'comparisons';
  preview.append(comparisons);
  if (data.benchmark === 'single-row') {
    const note = document.createElement('p');
    note.className = 'benchmark-note';
    note.textContent =
      'The timing control clicks the example’s 2,000-add button once from a fresh mount and waits for all rows to commit.';
    preview.append(note);
  }
  const benchmarkMeasurements = new Map();
  let running = false;
  const output = document.createElement('div');
  output.className = 'output';
  const codeTitle = document.createElement('strong');
  codeTitle.textContent = 'Compiled output';
  const code = document.createElement('pre');
  output.append(codeTitle, code);
  body.append(preview, output);
  shell.append(title, tabs, body);

  function load() {
    const variant = data.variants[selected];
    result.textContent = variant.error
      ? 'Build failed; see output.'
      : 'Each click adds one row.';
    code.textContent = variant.error ?? variant.generated;
    codeTitle.textContent = 'Compiled output';
    frame.src = variant.error
      ? 'about:blank'
      : `/frame.html?id=${id}&variant=${selected}&r=${revision}`;
    for (const button of tabs.children)
      button.classList.toggle('active', button.dataset.variant === selected);
    benchmark.disabled = Boolean(variant.error);
  }
  for (const variant of variants) {
    const button = document.createElement('button');
    button.dataset.variant = variant;
    button.textContent = data.variants[variant]?.label ?? variant;
    button.onclick = () => {
      if (running) return;
      selected = variant;
      load();
    };
    tabs.append(button);
  }
  reset.onclick = load;
  function waitForMount() {
    return new Promise((resolve, reject) => {
      const document = frame.contentDocument;
      const button = document.getElementById('run-2000');
      if (button) return resolve(button);
      const observer = new MutationObserver(() => {
        const next = document.getElementById('run-2000');
        if (next) {
          observer.disconnect();
          resolve(next);
        }
      });
      observer.observe(document.body, {childList: true, subtree: true});
      setTimeout(() => {
        observer.disconnect();
        reject(new Error('App did not mount'));
      }, 10000);
    });
  }
  function freshMount() {
    return new Promise((resolve, reject) => {
      frame.onload = () => {
        waitForMount().then(resolve, reject);
      };
      frame.src = `/frame.html?id=${id}&variant=${selected}&r=${revision}-${Date.now()}`;
    });
  }
  function nextPaint(frameWindow) {
    return new Promise(resolve =>
      frameWindow.requestAnimationFrame(() =>
        frameWindow.requestAnimationFrame(resolve)
      )
    );
  }
  function updateComparisons() {
    comparisons.replaceChildren();
    if (benchmarkMeasurements.size) {
      const heading = document.createElement('strong');
      heading.textContent = '2,000 single-row additions';
      comparisons.append(heading);
      for (const variant of variants) {
        const time = benchmarkMeasurements.get(variant);
        if (time == null) continue;
        const line = document.createElement('div');
        line.textContent = `${data.variants[variant].label}: ${time.toFixed(1)} ms`;
        comparisons.append(line);
      }
    }
  }
  benchmark.onclick = async () => {
    running = true;
    benchmark.disabled = true;
    reset.disabled = true;
    try {
      result.textContent = 'Mounting a fresh app…';
      const button = await freshMount();
      const list = frame.contentDocument.querySelector('ul');
      const committed = new Promise((resolve, reject) => {
        const observer = new MutationObserver(() => {
          if (list.childElementCount === 2000) {
            observer.disconnect();
            clearTimeout(timeout);
            resolve();
          }
        });
        const timeout = setTimeout(() => {
          observer.disconnect();
          reject(
            new Error(`Expected 2,000 rows, found ${list.childElementCount}`)
          );
        }, 60000);
        observer.observe(list, {childList: true});
      });
      const start = performance.now();
      result.textContent = 'Running the example’s 2,000-add button…';
      button.click();
      await committed;
      await nextPaint(frame.contentWindow);
      const count = frame.contentDocument.querySelector('ul').childElementCount;
      if (count !== 2000)
        throw new Error(`Expected 2,000 rows, found ${count}`);
      const elapsed = performance.now() - start;
      benchmarkMeasurements.set(selected, elapsed);
      result.textContent = `2,000 rows committed · ${elapsed.toFixed(1)} ms`;
      updateComparisons();
    } catch (error) {
      result.textContent = String(error.message ?? error);
    } finally {
      running = false;
      benchmark.disabled = false;
      reset.disabled = false;
    }
  };
  load();
  return shell;
}

// The DOM of an app in a form that ignores the documented differences of
// compiled blocks (attribute creation order, empty and split text nodes), with
// the state of form controls.
function canonicalDom(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.data;
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const attributes = [...node.attributes]
    .map(attribute => `${attribute.name}=${JSON.stringify(attribute.value)}`)
    .sort();
  if (node.localName === 'input')
    attributes.push(
      `:checked=${node.checked}`,
      `:value=${JSON.stringify(node.value)}`
    );
  let children = '';
  for (const child of node.childNodes) children += canonicalDom(child);
  return `<${node.localName} ${attributes.join(' ')}>${children}</${node.localName}>`;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

const scenarioRuns = 3;

// Runs the benchmarks of several examples (one scenario per benchmark button)
// in every build: each run mounts a fresh app, clicks its #setup button and
// waits for it to be painted, then times the benchmark button from the click
// until every update it made has committed and the page has been laid out.
// Paint is not included: browsers produce frames at the display's rate, which
// would round every workload shorter than a frame up to a frame. The final DOM
// of every build is compared with the build without the compiler.
function createScenarioWidget(group, widgetIds, widgets) {
  const variants = widgets[widgetIds[0]].variantIds;
  const shell = document.createElement('section');
  shell.className = 'widget scenario-widget';
  const title = document.createElement('div');
  title.className = 'widget-title';
  title.innerHTML = `<strong>Every optimization, one workload at a time</strong><span>${variants.length} builds, median of ${scenarioRuns} runs, until committed and laid out</span>`;
  const controls = document.createElement('div');
  controls.className = 'toolbar scenario-controls';
  const runAll = document.createElement('button');
  runAll.textContent = 'Time every build';
  const picker = document.createElement('select');
  const status = document.createElement('span');
  status.textContent = 'Finding benchmarks…';
  controls.append(runAll, picker, status);
  const results = document.createElement('table');
  results.className = 'scenario-results';
  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  const body = document.createElement('div');
  body.className = 'widget-body';
  const preview = document.createElement('div');
  preview.className = 'preview';
  const frame = document.createElement('iframe');
  frame.title = `Running ${group} scenarios`;
  preview.append(frame);
  const output = document.createElement('div');
  output.className = 'output';
  const codeTitle = document.createElement('strong');
  codeTitle.textContent = 'Compiled output';
  const code = document.createElement('pre');
  output.append(codeTitle, code);
  body.append(preview, output);
  shell.append(title, controls, results, tabs, body);

  const scenarios = [];
  const measurements = new Map();
  let selectedScenario = 0;
  let selectedVariant = variants[0];
  let running = false;

  function mount(widgetId, variantId) {
    const {benchmark} = widgets[widgetId];
    const ready = benchmark === 'single-row' ? '#run-2000' : '[data-benchmark]';
    return new Promise((resolve, reject) => {
      frame.onload = () => {
        const document = frame.contentDocument;
        if (document.querySelector(ready)) return resolve(document);
        const observer = new MutationObserver(() => {
          if (document.querySelector(ready)) {
            observer.disconnect();
            clearTimeout(timeout);
            resolve(document);
          }
        });
        const timeout = setTimeout(() => {
          observer.disconnect();
          reject(
            new Error(
              `${widgets[widgetId].variants[variantId].label} did not mount`
            )
          );
        }, 10000);
        observer.observe(document.body, {childList: true, subtree: true});
      };
      frame.src = `/frame.html?id=${widgetId}&variant=${variantId}&r=${revision}-${Date.now()}`;
    });
  }
  // The benchmark buttons only yield to microtasks, so a macrotask runs once
  // all their updates have committed. Reading a layout property then runs
  // style and layout for the committed DOM.
  async function committedAndLaidOut() {
    const frameWindow = frame.contentWindow;
    await new Promise(resolve => frameWindow.setTimeout(resolve, 0));
    void frame.contentDocument.body.offsetHeight;
  }
  function painted() {
    const frameWindow = frame.contentWindow;
    return new Promise(resolve =>
      frameWindow.requestAnimationFrame(() =>
        frameWindow.requestAnimationFrame(resolve)
      )
    );
  }
  function benchmarkButton(document, scenario) {
    return widgets[scenario.widgetId].benchmark === 'single-row'
      ? document.getElementById('run-2000')
      : document.querySelectorAll('[data-benchmark]')[scenario.index];
  }
  async function runOnce(scenario, variantId) {
    const document = await mount(scenario.widgetId, variantId);
    const setup = document.getElementById('setup');
    if (setup) {
      setup.click();
      await committedAndLaidOut();
    }
    await painted();
    const button = benchmarkButton(document, scenario);
    const start = performance.now();
    button.click();
    await committedAndLaidOut();
    const elapsed = performance.now() - start;
    if (widgets[scenario.widgetId].benchmark === 'single-row') {
      const count = document.querySelector('ul').childElementCount;
      if (count !== 2000)
        throw new Error(`Expected 2,000 rows, found ${count}`);
    }
    return {elapsed, dom: canonicalDom(document.getElementById('root'))};
  }

  function renderResults() {
    results.replaceChildren();
    const scenario = scenarios[selectedScenario];
    if (!scenario) return;
    const measured = measurements.get(selectedScenario);
    const head = document.createElement('tr');
    head.innerHTML =
      '<th>Build</th><th>Median</th><th>vs React Compiler</th><th>Same DOM as compiler off</th>';
    results.append(head);
    for (const variantId of variants) {
      const row = document.createElement('tr');
      const result = measured?.get(variantId);
      const baseline = measured?.get('compiler');
      const cells = [
        widgets[scenario.widgetId].variants[variantId].label,
        '',
        '',
        '',
      ];
      if (result?.error) {
        cells[1] = result.error;
      } else if (result) {
        cells[1] = `${result.median.toFixed(1)} ms`;
        if (baseline && !baseline.error)
          cells[2] = `${(baseline.median / result.median).toFixed(2)}×`;
        const reference = measured.get('plain');
        cells[3] =
          reference && !reference.error
            ? result.dom === reference.dom
              ? 'yes'
              : 'NO'
            : '';
      }
      for (const text of cells) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.append(cell);
      }
      if (cells[3] === 'NO') row.className = 'error';
      results.append(row);
    }
  }
  function showVariant() {
    const scenario = scenarios[selectedScenario];
    const widgetId = scenario ? scenario.widgetId : widgetIds[0];
    const variant = widgets[widgetId].variants[selectedVariant];
    code.textContent = variant.error ?? variant.generated;
    for (const button of tabs.children)
      button.classList.toggle(
        'active',
        button.dataset.variant === selectedVariant
      );
    if (!running)
      frame.src = variant.error
        ? 'about:blank'
        : `/frame.html?id=${widgetId}&variant=${selectedVariant}&r=${revision}`;
  }
  for (const variantId of variants) {
    const button = document.createElement('button');
    button.dataset.variant = variantId;
    button.textContent = widgets[widgetIds[0]].variants[variantId].label;
    button.onclick = () => {
      if (running) return;
      selectedVariant = variantId;
      showVariant();
    };
    tabs.append(button);
  }
  picker.onchange = () => {
    selectedScenario = Number(picker.value);
    renderResults();
    showVariant();
  };

  runAll.onclick = async () => {
    const scenario = scenarios[selectedScenario];
    running = true;
    runAll.disabled = picker.disabled = true;
    const measured = new Map();
    measurements.set(selectedScenario, measured);
    renderResults();
    try {
      for (const variantId of variants) {
        const variant = widgets[scenario.widgetId].variants[variantId];
        if (variant.error) {
          measured.set(variantId, {
            error: 'Build failed; see compiled output.',
          });
          continue;
        }
        const times = [];
        let dom = null;
        try {
          for (let run = 0; run < scenarioRuns; run++) {
            status.textContent = `${variant.label}: run ${run + 1} of ${scenarioRuns}…`;
            const result = await runOnce(scenario, variantId);
            times.push(result.elapsed);
            dom = result.dom;
          }
          measured.set(variantId, {median: median(times), dom});
        } catch (error) {
          measured.set(variantId, {error: String(error.message ?? error)});
        }
        renderResults();
      }
      status.textContent = `${scenario.name}: done`;
    } finally {
      running = false;
      runAll.disabled = picker.disabled = false;
    }
  };

  (async () => {
    runAll.disabled = picker.disabled = true;
    running = true;
    try {
      for (const widgetId of widgetIds) {
        if (widgets[widgetId].variants.plain.error)
          throw new Error(`${widgetId} failed to build without the compiler`);
        const document = await mount(widgetId, 'plain');
        const buttons =
          widgets[widgetId].benchmark === 'single-row'
            ? [document.getElementById('run-2000')]
            : [...document.querySelectorAll('[data-benchmark]')];
        buttons.forEach((button, index) =>
          scenarios.push({widgetId, index, name: button.textContent.trim()})
        );
      }
      scenarios.forEach((scenario, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = scenario.name;
        picker.append(option);
      });
      status.textContent = 'Pick a workload and time every build.';
      runAll.disabled = picker.disabled = false;
    } catch (error) {
      status.textContent = String(error.message ?? error);
    } finally {
      running = false;
    }
    renderResults();
    showVariant();
  })();
  return shell;
}

async function update() {
  const response = await fetch('/api/article', {cache: 'no-store'});
  const data = await response.json();
  if (data.revision === revision) return;
  revision = data.revision;
  status.textContent = data.error
    ? 'Build error'
    : `Updated ${new Date().toLocaleTimeString()}`;
  if (data.error) {
    const error = document.createElement('pre');
    error.className = 'error';
    error.textContent = data.error;
    articleNode.prepend(error);
    return;
  }
  articleNode.innerHTML = data.html;
  for (const block of articleNode.querySelectorAll('[data-compile]')) {
    const variant =
      data.widgets[block.dataset.compile]?.variants[block.dataset.variant];
    block.textContent =
      variant?.error ?? variant?.generated ?? 'No matching preview source.';
  }
  for (const slot of articleNode.querySelectorAll('[data-scenarios]')) {
    const group = slot.dataset.scenarios;
    slot.replaceWith(
      createScenarioWidget(group, data.scenarios[group], data.widgets)
    );
  }
  for (const slot of articleNode.querySelectorAll('[data-preview]')) {
    const id = slot.dataset.preview;
    slot.replaceWith(createWidget(id, data.widgets[id]));
  }
}

await update();
const events = new EventSource('/events');
events.onmessage = () => {
  void update();
};
events.onerror = () => {
  status.textContent = 'Disconnected; reconnecting…';
};
