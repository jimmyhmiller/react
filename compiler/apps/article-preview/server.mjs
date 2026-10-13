import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {homedir} from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Marked} from 'marked';

const root = path.dirname(fileURLToPath(import.meta.url));
const compilerRoot = path.resolve(root, '../..');
const inliningCompilerRoot = path.resolve(
  compilerRoot,
  '../../unsafe-map-inline-demo/compiler'
);
// This repository's experimental React build, which has the compiled blocks
// runtime (see README.md). Every variant uses it, so the same label means the
// same build in every widget.
const localReact = path.resolve(compilerRoot, '../build/node_modules');
const defaultArticle = path.join(
  homedir(),
  'Documents/Code/PlayGround/writings/What Does the React Compiler Even Do.md'
);
const articlePath = path.resolve(process.argv[2] ?? defaultArticle);
const port = Number(process.env.PORT ?? 4177);
const requireCompiler = createRequire(path.join(compilerRoot, 'package.json'));
const babel = requireCompiler('@babel/core');
const presetReact = requireCompiler.resolve('@babel/preset-react');
const esbuild = requireCompiler('esbuild');
const rustPlugin = requireCompiler(
  './packages/babel-plugin-react-compiler-rust/dist/index.js'
).default;
const inliningPlugin = createRequire(
  path.join(inliningCompilerRoot, 'package.json')
)('./packages/babel-plugin-react-compiler-rust/dist/index.js').default;
const marked = new Marked({gfm: true});
const variants = [
  {id: 'plain', label: 'Compiler off', environment: null},
  {id: 'compiler', label: 'React Compiler', environment: {}},
  {
    id: 'inlining',
    label: 'Inlining',
    environment: {enableComponentInlining: true},
    plugin: inliningPlugin,
  },
  {id: 'blocks', label: 'Blocks', environment: {enableJsxBlocks: true}},
  {
    id: 'inlining-blocks',
    label: 'Inlining + blocks',
    environment: {enableComponentInlining: true, enableJsxBlocks: true},
    plugin: inliningPlugin,
  },
  {
    id: 'inlining-blocks-lists',
    label: '+ list item memoization',
    environment: {
      enableComponentInlining: true,
      enableJsxBlocks: true,
      enableListItemMemoization: true,
    },
    plugin: inliningPlugin,
  },
  {
    id: 'inlining-blocks-lists-incremental',
    label: '+ incremental list mapping',
    environment: {
      enableComponentInlining: true,
      enableJsxBlocks: true,
      enableListItemMemoization: true,
      enableIncrementalListMapping: true,
    },
    plugin: inliningPlugin,
  },
  {
    id: 'inlining-all',
    label: '+ context and store selectors',
    environment: {
      enableComponentInlining: true,
      enableJsxBlocks: true,
      enableListItemMemoization: true,
      enableIncrementalListMapping: true,
      enableContextSelectors: true,
    },
    plugin: inliningPlugin,
  },
];
const variantsById = new Map(variants.map(variant => [variant.id, variant]));
// Each preview attribute of a fence declares a widget for the fence's source,
// comparing these variants. `preview=` compares the builds without blocks,
// `blocks-preview=` adds compiled blocks alone and with inlining, and
// `stack-preview=` adds the list optimizations one at a time on top of
// inlining and blocks.
const widgetVariants = {
  preview: ['plain', 'compiler', 'inlining'],
  'blocks-preview': [
    'plain',
    'compiler',
    'inlining',
    'blocks',
    'inlining-blocks',
  ],
  'stack-preview': [
    'plain',
    'compiler',
    'inlining',
    'inlining-blocks',
    'inlining-blocks-lists',
    'inlining-blocks-lists-incremental',
  ],
};
// `scenarios=<group>` adds the fence to the `[SCENARIOS:<group>]()` widget,
// which runs each fence's benchmarks in every build of the full stack. The
// fence is named by `id=`, or else by its `preview=` id.
const scenarioVariants = [...widgetVariants['stack-preview'], 'inlining-all'];
const fenceAttributes = new Set([
  ...Object.keys(widgetVariants),
  'scenarios',
  'id',
  'benchmark',
]);
// `single-row`: the app's #run-2000 button adds 2,000 rows one at a time.
// `buttons`: every [data-benchmark] button of the app is a benchmark, run after
// clicking the app's #setup button (if it has one).
const benchmarkModes = new Set(['single-row', 'buttons']);
let revision = 0;
let article = {html: '', widgets: {}, error: null, revision};
const clients = new Set();
let refreshing = false;
let pendingRefresh = false;

function extractWidgets(markdown) {
  const fences = new Map();
  const scenarioGroups = new Map();
  const fencePattern =
    /^```(?:jsx|tsx|javascript|typescript)[ \t]+([^\n]*\b(?:preview|scenarios)=[^\n]*?)\s*\n([\s\S]*?)^```\s*$/gm;
  for (const match of markdown.matchAll(fencePattern)) {
    const attributes = {};
    for (const attribute of match[1].split(/\s+/)) {
      const parsed = /^([a-z-]+)=([a-z0-9-]+)$/.exec(attribute);
      if (!parsed || !fenceAttributes.has(parsed[1]))
        throw new Error(`Unknown preview fence attribute: ${attribute}`);
      attributes[parsed[1]] = parsed[2];
    }
    if (
      attributes.benchmark !== undefined &&
      !benchmarkModes.has(attributes.benchmark)
    ) {
      throw new Error(`Unknown benchmark: ${attributes.benchmark}`);
    }
    const benchmark = attributes.benchmark ?? null;
    const widgets = Object.keys(widgetVariants)
      .filter(attribute => attributes[attribute] !== undefined)
      .map(attribute => [attributes[attribute], widgetVariants[attribute]]);
    for (const [id, variantIds] of widgets) {
      if (fences.has(id)) throw new Error(`Duplicate preview source: ${id}`);
      fences.set(id, {source: match[2], benchmark, variantIds});
    }
    if (attributes.scenarios !== undefined) {
      const sourceId = attributes.id ?? attributes.preview;
      if (sourceId === undefined)
        throw new Error(
          `A scenarios=${attributes.scenarios} fence needs an id= or preview= attribute`
        );
      if (benchmark === null)
        throw new Error(`Scenario ${sourceId} needs a benchmark= attribute`);
      const id = `${attributes.scenarios}--${sourceId}`;
      if (fences.has(id))
        throw new Error(`Duplicate scenario source: ${sourceId}`);
      fences.set(id, {
        source: match[2],
        benchmark,
        variantIds: scenarioVariants,
      });
      if (!scenarioGroups.has(attributes.scenarios))
        scenarioGroups.set(attributes.scenarios, []);
      scenarioGroups.get(attributes.scenarios).push(id);
    }
  }
  const ids = [...markdown.matchAll(/^\[PREVIEW:([a-z0-9-]+)\]\(\)\s*$/gm)].map(
    match => match[1]
  );
  for (const id of ids) {
    if (!fences.has(id))
      throw new Error(`Preview ${id} has no matching code fence`);
  }
  const groups = [
    ...markdown.matchAll(/^\[SCENARIOS:([a-z0-9-]+)\]\(\)\s*$/gm),
  ].map(match => match[1]);
  for (const group of groups) {
    if (!scenarioGroups.has(group))
      throw new Error(
        `Scenarios ${group} has no scenarios=${group} code fence`
      );
  }
  const html = marked.parse(
    markdown
      .replace(
        /^\[SCENARIOS:([a-z0-9-]+)\]\(\)\s*$/gm,
        (_, group) =>
          `<div class="scenario-slot" data-scenarios="${group}"></div>`
      )
      .replace(
        /^\[PREVIEW:([a-z0-9-]+)\]\(\)\s*$/gm,
        (_, id) => `<div class="preview-slot" data-preview="${id}"></div>`
      )
      .replace(
        /^\[COMPILE:([a-z0-9-]+):([a-z0-9-]+)\]\(\)\s*$/gm,
        (_, id, variant) =>
          `<pre class="generated-block" data-compile="${id}" data-variant="${variant}"></pre>`
      )
  );
  for (const [, id, variant] of markdown.matchAll(
    /^\[COMPILE:([a-z0-9-]+):([a-z0-9-]+)\]\(\)\s*$/gm
  )) {
    if (!ids.includes(id))
      throw new Error(`Compiled output ${id} has no matching preview marker`);
    if (!fences.get(id).variantIds.includes(variant))
      throw new Error(`Preview ${id} has no variant ${variant}`);
  }
  const scenarios = Object.fromEntries(
    groups.map(group => [group, scenarioGroups.get(group)])
  );
  const widgetIds = [...ids, ...Object.values(scenarios).flat()];
  return {
    html,
    scenarios,
    sources: new Map(widgetIds.map(id => [id, fences.get(id)])),
  };
}

function compile(source, variant, id) {
  const input = /\bexport\s+default\b/.test(source)
    ? source
    : `${source}\nexport default App;\n`;
  const events = [];
  const plugins =
    variant.environment === null
      ? []
      : [
          [
            variant.plugin ?? rustPlugin,
            {
              target: '19',
              compilationMode: 'infer',
              panicThreshold: 'all_errors',
              environment: variant.environment,
              logger: {logEvent: (_filename, event) => events.push(event)},
            },
          ],
        ];
  const output = babel.transformSync(input, {
    filename: `${id}.tsx`,
    babelrc: false,
    configFile: false,
    parserOpts: {plugins: ['jsx', 'typescript']},
    plugins,
  });
  const failures = events.filter(event => event.kind !== 'CompileSuccess');
  if (failures.length) throw new Error(JSON.stringify(failures, null, 2));
  return output.code;
}

function reactAliases() {
  if (!fs.existsSync(path.join(localReact, 'react-dom'))) {
    throw new Error(
      `The preview needs the experimental React build in ${localReact}. See README.md.`
    );
  }
  return {
    react: path.join(localReact, 'react'),
    'react-dom': path.join(localReact, 'react-dom'),
    scheduler: path.join(localReact, 'scheduler'),
  };
}

async function bundle(generated, id, variant) {
  const executable = babel.transformSync(generated, {
    filename: `${id}.tsx`,
    babelrc: false,
    configFile: false,
    presets: [[presetReact, {runtime: 'automatic'}]],
  }).code;
  const entry = `${executable}\nimport {createRoot} from 'react-dom/client';\nimport React from 'react';\nconst root = createRoot(document.getElementById('root'));\nroot.render(React.createElement(App));`;
  const result = await esbuild.build({
    stdin: {
      contents: entry,
      resolveDir: root,
      sourcefile: `${id}-${variant.id}.jsx`,
      loader: 'jsx',
    },
    bundle: true,
    write: false,
    minify: false,
    format: 'iife',
    platform: 'browser',
    define: {'process.env.NODE_ENV': '"production"'},
    absWorkingDir: root,
    alias: reactAliases(),
  });
  return result.outputFiles[0].text;
}

async function buildWidget(id, {source, benchmark, variantIds}) {
  const builds = {};
  for (const variant of variantIds.map(variantId =>
    variantsById.get(variantId)
  )) {
    try {
      const generated = compile(source, variant, id);
      builds[variant.id] = {
        label: variant.label,
        generated,
        bundle: await bundle(generated, id, variant),
      };
    } catch (error) {
      builds[variant.id] = {
        label: variant.label,
        error: String(error.stack ?? error),
      };
    }
  }
  return {source, benchmark, variantIds, variants: builds};
}

async function refresh() {
  if (refreshing) {
    pendingRefresh = true;
    return;
  }
  refreshing = true;
  do {
    pendingRefresh = false;
    try {
      const markdown = fs.readFileSync(articlePath, 'utf8');
      const {html, scenarios, sources} = extractWidgets(markdown);
      const widgets = {};
      for (const [id, config] of sources)
        widgets[id] = await buildWidget(id, config);
      article = {html, widgets, scenarios, error: null, revision: ++revision};
    } catch (error) {
      article = {
        ...article,
        error: String(error.stack ?? error),
        revision: ++revision,
      };
    }
    for (const client of clients) client.write(`data: ${article.revision}\n\n`);
    console.log(
      article.error ??
        `Preview revision ${article.revision}: ${Object.keys(article.widgets).join(', ')}`
    );
  } while (pendingRefresh);
  refreshing = false;
}

function send(response, status, type, body) {
  response.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);
  if (url.pathname === '/events') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    response.write(`data: ${revision}\n\n`);
    clients.add(response);
    request.on('close', () => clients.delete(response));
    return;
  }
  if (url.pathname === '/api/article')
    return send(
      response,
      200,
      'application/json',
      JSON.stringify({
        ...article,
        widgets: Object.fromEntries(
          Object.entries(article.widgets).map(([id, widget]) => [
            id,
            {
              ...widget,
              variants: Object.fromEntries(
                Object.entries(widget.variants).map(([key, value]) => [
                  key,
                  {...value, bundle: undefined},
                ])
              ),
            },
          ])
        ),
      })
    );
  const bundleMatch = /^\/bundle\/([a-z0-9-]+)\/([a-z0-9-]+)\.js$/.exec(
    url.pathname
  );
  if (bundleMatch) {
    const bundle =
      article.widgets[bundleMatch[1]]?.variants[bundleMatch[2]]?.bundle;
    return send(response, bundle ? 200 : 404, 'text/javascript', bundle ?? '');
  }
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!['index.html', 'style.css', 'app.js', 'frame.html'].includes(file))
    return send(response, 404, 'text/plain', 'Not found');
  const type = file.endsWith('.css')
    ? 'text/css'
    : file.endsWith('.js')
      ? 'text/javascript'
      : 'text/html';
  return send(
    response,
    200,
    type,
    fs.readFileSync(path.join(root, 'public', file))
  );
});

await refresh();
fs.watchFile(articlePath, {interval: 400}, () => {
  void refresh();
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Article preview: http://127.0.0.1:${port}`)
);
