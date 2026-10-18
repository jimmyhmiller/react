import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ROOT, REPO, COMPILER, requireCompiler, FLAGS, VARIANTS} from './config.mjs';
const babel = requireCompiler('@babel/core');
const esbuild = requireCompiler('esbuild');
const preset = requireCompiler.resolve('@babel/preset-react');
const plugin = requireCompiler('./packages/babel-plugin-react-compiler-rust/dist/index.js').default;
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const local = path.join(REPO, 'build/node_modules');
const native = path.join(COMPILER, 'packages/babel-plugin-react-compiler-rust/native/index.node');
const sourceNames = fs.readdirSync(path.join(ROOT, 'src')).sort();
const sourceHash = hash(sourceNames.map(name => `${name}\n${fs.readFileSync(path.join(ROOT, 'src', name), 'utf8')}`).join('\n'));
const provenance = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: REPO, encoding: 'utf8'}).trim(),
  branch: execFileSync('git', ['branch', '--show-current'], {cwd: REPO, encoding: 'utf8'}).trim(),
  sourceHash, nativeHash: hash(fs.readFileSync(native)),
  reactClientHash: hash(fs.readFileSync(path.join(local, 'react-dom/cjs/react-dom-client.production.js'))),
  compilerRuntimeHash: hash(fs.readFileSync(path.join(local, 'react/cjs/react-compiler-runtime.production.js'))),
};
const manifest = {created: new Date().toISOString(), provenance, flags: FLAGS, variants: [], failures: [], stateVariablesProbe: {}};
const groups = new Map();
fs.mkdirSync(path.join(ROOT, 'dist'), {recursive: true});
const compile = (filename, environment) => {
  const events = [];
  const {code} = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    plugins: environment === null ? [] : [[plugin, {target: '19', compilationMode: 'infer', panicThreshold: 'all_errors', environment, logger: {logEvent: (_file, event) => events.push(event)}}]],
    presets: [[preset, {runtime: 'automatic'}]],
  });
  const failures = events.filter(event => event.kind !== 'CompileSuccess');
  if (failures.length) throw new Error(JSON.stringify(failures));
  return {code, compiledFunctions: events.length};
};
for (const variant of VARIANTS) {
  try {
    const modules = {};
    for (const name of ['Editor.jsx', `state-${variant.architecture}.jsx`]) {
      const filename = path.join(ROOT, 'src', name);
      modules[filename] = compile(filename, variant.environment);
    }
    const fingerprint = hash(JSON.stringify(Object.values(modules).map(m => m.code)));
    const combined = Object.values(modules).map(m => m.code).join('\n');
    const audit = {
      compiledFunctions: Object.values(modules).reduce((n, m) => n + m.compiledFunctions, 0),
      blockTemplates: (combined.match(/createBlockTemplate\(/g) ?? []).length,
      incrementalMaps: (combined.match(/\.mapIncremental\(/g) ?? []).length,
      listCaches: (combined.match(/useListItemMemoCache\(/g) ?? []).length,
      contextSelections: (combined.match(/useContextPaths\(/g) ?? []).length,
      hookSelections: (combined.match(/selectHookPaths\(/g) ?? []).length,
      slicedHooks: (combined.match(/skipStoreHook\d\(/g) ?? []).length,
      staticIslands: (combined.match(/_jsx\(StaticIsland/g) ?? []).length,
    };
    // Repeated equivalent compiler output is one measured configuration, with all aliases retained.
    const representative = groups.get(fingerprint);
    if (representative) {
      manifest.variants.push({...variant, fingerprint, representative, audit});
      continue;
    }
    groups.set(fingerprint, variant.id);
    const outdir = path.join(ROOT, 'dist', variant.id);
    fs.mkdirSync(outdir, {recursive: true});
    for (const [filename, result] of Object.entries(modules)) fs.writeFileSync(path.join(outdir, path.basename(filename) + '.compiled.js'), result.code);
    await esbuild.build({
      absWorkingDir: ROOT, entryPoints: [path.join(ROOT, 'src/main.jsx')], bundle: true, minify: true,
      outfile: path.join(outdir, 'app.js'), format: 'iife', target: 'es2020', jsx: 'automatic',
      alias: {react: path.join(local, 'react'), 'react-dom': path.join(local, 'react-dom'), scheduler: path.join(local, 'scheduler'), '@state': path.join(ROOT, 'src', `state-${variant.architecture}.jsx`)},
      define: {'process.env.NODE_ENV': '"production"', 'import.meta.env.PROD': 'true', __VARIANT__: JSON.stringify(variant.id), __VARIANT_LABEL__: JSON.stringify(variant.label)},
      plugins: [{name: 'local-rust-compiler', setup(build) { build.onLoad({filter: /\.jsx$/}, args => modules[args.path] ? {contents: modules[args.path].code, loader: 'js'} : undefined); }}],
      logLevel: 'silent',
    });
    let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    html = html.replace('<script type="module" src="/src/main.jsx"></script>', '<script src="./app.js"></script>')
      .replace('</head>', '<link rel="stylesheet" href="./app.css" /></head>');
    fs.writeFileSync(path.join(outdir, 'index.html'), html);
    manifest.variants.push({...variant, fingerprint, representative: variant.id, audit});
    console.log(`Built ${variant.id}: ${variant.label}`);
  } catch (error) {
    manifest.failures.push({...variant, error: error.stack});
    console.error(`FAILED ${variant.id}: ${error.message.slice(0, 250)}`);
  }
}
// State variables change source-language semantics, but DRAW uses useState already.
// Verify this flag adds no generated changes rather than implying a measured optimization.
for (const architecture of ['context', 'store']) {
  const files = ['Editor.jsx', `state-${architecture}.jsx`];
  manifest.stateVariablesProbe[architecture] = files.every(name => {
    const file = path.join(ROOT, 'src', name);
    return compile(file, {}).code === compile(file, {enableStateVariables: true}).code;
  });
}
fs.writeFileSync(path.join(ROOT, 'dist/manifest.json'), JSON.stringify(manifest, null, 2));
fs.copyFileSync(path.join(ROOT, 'dashboard.html'), path.join(ROOT, 'dist/index.html'));
console.log(`${manifest.variants.length} configurations, ${groups.size} distinct generated outputs, ${manifest.failures.length} build failures`);
