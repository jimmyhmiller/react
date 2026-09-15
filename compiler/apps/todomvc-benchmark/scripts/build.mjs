/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Builds one production bundle per app and variant into dist/<variant>/<app>/.
//
// React variants compile the same app sources (src/TodoApp.jsx,
// src/RowsApp.jsx); the Rust React Compiler
// (packages/babel-plugin-react-compiler-rust) must already be built, e.g. by
// running `yarn snap --rust` from compiler/. Preact renders the same sources
// through preact/compat. Solid, Svelte and Vue build src/<framework>/ with
// each framework's own compiler. See scripts/variants.mjs.

import {createRequire} from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {APPS} from './apps.mjs';
import {VARIANTS, variantHasApp} from './variants.mjs';

const require = createRequire(import.meta.url);
// BENCH_NO_MINIFY=1 keeps function names in the bundles, for profiling.
const MINIFY = process.env.BENCH_NO_MINIFY !== '1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPILER_ROOT = path.resolve(ROOT, '..', '..');
const REPO_ROOT = path.resolve(COMPILER_ROOT, '..');
const LOCAL_REACT = path.join(REPO_ROOT, 'build', 'node_modules');
const babel = require(path.join(COMPILER_ROOT, 'node_modules/@babel/core'));
const esbuild = require(path.join(COMPILER_ROOT, 'node_modules/esbuild'));
const presetReact = path.join(COMPILER_ROOT, 'node_modules/@babel/preset-react');
// Framework packages are installed in this directory.
const requireFromApp = createRequire(path.join(ROOT, 'package.json'));
const rustPluginPath = path.join(
  COMPILER_ROOT,
  'packages/babel-plugin-react-compiler-rust/dist/index.js',
);

function compileApp(variant, app) {
  return compileModule(variant, path.join(ROOT, 'src', app.source));
}

function compileModule(variant, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const events = [];
  const plugins = [];
  if (variant.compiler !== null) {
    const rustPlugin = require(rustPluginPath).default;
    plugins.push([
      rustPlugin,
      {
        target: '19',
        compilationMode: 'infer',
        panicThreshold: 'all_errors',
        environment: variant.compiler.environment,
        logger: {logEvent: (_filename, event) => events.push(event)},
      },
    ]);
  }
  const result = babel.transformSync(source, {
    filename,
    babelrc: false,
    configFile: false,
    plugins,
    presets: [[presetReact, {runtime: 'automatic'}]],
  });
  const failures = events.filter(event => event.kind !== 'CompileSuccess');
  if (failures.length !== 0) {
    throw new Error(
      `Variant '${variant.name}' did not compile cleanly:\n${JSON.stringify(failures, null, 2)}`,
    );
  }
  return {
    code: result.code,
    compiledFunctions: events.length,
  };
}

/** Component names still rendered as elements (i.e. not inlined). */
function renderedComponents(code) {
  const names = new Set();
  for (const match of code.matchAll(/_jsxs?\(([A-Z][A-Za-z0-9]*)[,)]/g)) {
    if (!match[1].startsWith('_BlockTemplate') && !match[1].startsWith('BlockTemplate')) {
      names.add(match[1]);
    }
  }
  return [...names].sort();
}

function blockTemplateCount(code) {
  return [...code.matchAll(/_createBlockTemplate\(/g)].length;
}

function reactAliases(variant) {
  if (variant.react === 'npm') {
    return {};
  }
  if (!fs.existsSync(path.join(LOCAL_REACT, 'react-dom'))) {
    throw new Error(
      `Variant '${variant.name}' needs a local React build in ${LOCAL_REACT}. See scripts/variants.mjs.`,
    );
  }
  return {
    react: path.join(LOCAL_REACT, 'react'),
    'react-dom': path.join(LOCAL_REACT, 'react-dom'),
    scheduler: path.join(LOCAL_REACT, 'scheduler'),
  };
}

// esbuild plugin: compiles src/solid/**/*.jsx with babel-preset-solid.
function solidPlugin() {
  const preset = requireFromApp.resolve('babel-preset-solid');
  return {
    name: 'solid',
    setup(build) {
      build.onLoad({filter: /[\\/]src[\\/]solid[\\/].*\.jsx$/}, async args => {
        const source = fs.readFileSync(args.path, 'utf8');
        const result = await babel.transformAsync(source, {
          filename: args.path,
          babelrc: false,
          configFile: false,
          presets: [[preset, {generate: 'dom'}]],
        });
        return {contents: result.code, loader: 'js'};
      });
    },
  };
}

// esbuild plugin: compiles .svelte components and .svelte.js modules with the
// Svelte compiler, failing the build on compiler warnings.
function sveltePlugin() {
  return {
    name: 'svelte',
    setup(build) {
      // svelte/compiler has a CommonJS entry point.
      const compiler = requireFromApp('svelte/compiler');
      const loadCompiler = async () => compiler;
      // Accessibility warnings are about the markup that TodoMVC and
      // js-framework-benchmark prescribe (and every variant renders); any
      // other warning fails the build.
      const checkWarnings = (file, allWarnings) => {
        const warnings = allWarnings.filter(w => !w.code.startsWith('a11y_'));
        if (warnings.length !== 0) {
          throw new Error(
            `Svelte compiler warnings in ${file}:\n` +
              warnings.map(w => `${w.code}: ${w.message}`).join('\n'),
          );
        }
      };
      build.onLoad({filter: /\.svelte$/}, async args => {
        const {compile} = await loadCompiler();
        const source = fs.readFileSync(args.path, 'utf8');
        const result = compile(source, {
          filename: args.path,
          generate: 'client',
          dev: false,
        });
        checkWarnings(args.path, result.warnings);
        return {contents: result.js.code, loader: 'js'};
      });
      build.onLoad({filter: /\.svelte\.js$/}, async args => {
        const {compileModule} = await loadCompiler();
        const source = fs.readFileSync(args.path, 'utf8');
        const result = compileModule(source, {
          filename: args.path,
          generate: 'client',
          dev: false,
        });
        checkWarnings(args.path, result.warnings);
        return {contents: result.js.code, loader: 'js'};
      });
    },
  };
}

// esbuild plugin: compiles Vue single-file components (script setup with the
// template inlined into the render function, as in a production build).
function vuePlugin() {
  const sfc = requireFromApp('vue/compiler-sfc');
  return {
    name: 'vue',
    setup(build) {
      build.onLoad({filter: /\.vue$/}, args => {
        const source = fs.readFileSync(args.path, 'utf8');
        const {descriptor, errors} = sfc.parse(source, {filename: args.path});
        if (errors.length !== 0) {
          throw new Error(
            `Vue SFC errors in ${args.path}:\n${errors.map(String).join('\n')}`,
          );
        }
        const id = crypto
          .createHash('sha256')
          .update(args.path)
          .digest('hex')
          .slice(0, 8);
        const script = sfc.compileScript(descriptor, {
          id,
          isProd: true,
          inlineTemplate: true,
        });
        return {contents: script.content, loader: 'js'};
      });
    },
  };
}

function frameworkBuildOptions(variant) {
  switch (variant.framework) {
    case 'preact':
      return {
        alias: {react: 'preact/compat', 'react-dom': 'preact/compat'},
        plugins: [],
        define: {},
      };
    case 'solid':
      return {alias: {}, plugins: [solidPlugin()], define: {}};
    case 'svelte':
      return {alias: {}, plugins: [sveltePlugin()], define: {}};
    case 'vue':
      return {
        alias: {},
        plugins: [vuePlugin()],
        define: {
          __VUE_OPTIONS_API__: 'false',
          __VUE_PROD_DEVTOOLS__: 'false',
          __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
        },
      };
    default:
      throw new Error(`Unknown framework: ${variant.framework}`);
  }
}

function writePage(outDir, app, variant) {
  fs.copyFileSync(path.join(ROOT, app.css), path.join(outDir, 'index.css'));
  fs.writeFileSync(
    path.join(outDir, 'index.html'),
    `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${app.name}: ${variant.name}</title><link rel="stylesheet" href="index.css"></head>
<body><div id="root"></div><script src="bundle.js"></script></body>
</html>
`,
  );
}

async function buildReactVariant(variant, app, outDir) {
  // Preact renders the uncompiled React sources.
  const reactVariant =
    variant.framework === 'preact' ? {...variant, compiler: null} : variant;
  const options =
    variant.framework === 'preact'
      ? frameworkBuildOptions(variant)
      : {alias: reactAliases(variant), plugins: [], define: {}};
  const {code, compiledFunctions} = compileApp(reactVariant, app);
  // The app's other modules (like its stores) are compiled like the app, as
  // the compiler runs on every module of an app.
  const modulePaths = new Set(
    (app.modules ?? []).map(module => path.join(ROOT, 'src', module)),
  );
  const compiledModules = {
    name: 'compiled-modules',
    setup(build) {
      build.onLoad({filter: /\.jsx?$/}, args => {
        if (!modulePaths.has(args.path)) {
          return undefined;
        }
        return {
          contents: compileModule(reactVariant, args.path).code,
          loader: 'js',
        };
      });
    },
  };
  const compiledPath = path.join(
    ROOT,
    'src',
    app.source.replace('.jsx', '.compiled.js'),
  );
  fs.writeFileSync(compiledPath, code);
  try {
    await esbuild.build({
      entryPoints: [path.join(ROOT, 'src', app.entry)],
      bundle: true,
      minify: MINIFY,
      format: 'iife',
      jsx: 'automatic',
      define: {'process.env.NODE_ENV': '"production"', ...options.define},
      nodePaths: [path.join(ROOT, 'node_modules')],
      alias: options.alias,
      plugins: [compiledModules, ...options.plugins],
      outfile: path.join(outDir, 'bundle.js'),
      logLevel: 'error',
    });
    fs.copyFileSync(compiledPath, path.join(outDir, path.basename(compiledPath)));
    if (variant.framework === 'react') {
      await buildServerRenderedPage(variant, app, outDir, compiledPath, {
        alias: options.alias,
        plugins: [compiledModules, ...options.plugins],
        define: options.define,
      });
    }
  } finally {
    fs.rmSync(compiledPath);
  }
  return {code, compiledFunctions};
}

// The root of a server-rendered page, on the server and the client: marks the
// document once the app is hydrated (effects run after hydration commits), so
// that verify.mjs and bench.mjs wait for hydration.
const SSR_ROOT = `import {useEffect} from 'react';
function Root() {
  useEffect(() => { document.body.setAttribute('data-hydrated', ''); }, []);
  return <App />;
}`;

// Builds dist/<variant>/<app>/ssr/: the app rendered to HTML with the
// variant's React server renderer, and a bundle that hydrates it (see
// verify.mjs --ssr).
async function buildServerRenderedPage(variant, app, outDir, compiledPath, options) {
  const ssrDir = path.join(outDir, 'ssr');
  fs.mkdirSync(ssrDir, {recursive: true});
  const appImport = './' + path.basename(compiledPath);
  const shared = {
    bundle: true,
    jsx: 'automatic',
    define: {'process.env.NODE_ENV': '"production"', ...options.define},
    nodePaths: [path.join(ROOT, 'node_modules')],
    alias: options.alias,
    plugins: options.plugins,
    logLevel: 'error',
  };
  const serverFile = path.join(ssrDir, 'server.cjs');
  await esbuild.build({
    ...shared,
    stdin: {
      contents: `import {renderToString} from 'react-dom/server';\nimport App from '${appImport}';\n${SSR_ROOT}\nexport function render() { return renderToString(<Root />); }\n`,
      resolveDir: path.dirname(compiledPath),
      sourcefile: 'ssr-entry.jsx',
      loader: 'jsx',
    },
    platform: 'node',
    format: 'cjs',
    outfile: serverFile,
  });
  delete require.cache[serverFile];
  const html = require(serverFile).render();
  await esbuild.build({
    ...shared,
    stdin: {
      contents: `import {hydrateRoot} from 'react-dom/client';\nimport App from '${appImport}';\n${SSR_ROOT}\nhydrateRoot(document.getElementById('root'), <Root />, {onRecoverableError(error) { console.error('Recoverable error: ' + error.message); }});\n`,
      resolveDir: path.dirname(compiledPath),
      sourcefile: 'hydrate-entry.jsx',
      loader: 'jsx',
    },
    minify: MINIFY,
    format: 'iife',
    outfile: path.join(ssrDir, 'bundle.js'),
  });
  fs.copyFileSync(path.join(ROOT, app.css), path.join(ssrDir, 'index.css'));
  fs.writeFileSync(
    path.join(ssrDir, 'index.html'),
    `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${app.name}: ${variant.name} (server rendered)</title><link rel="stylesheet" href="index.css"></head>
<body><div id="root">${html}</div><script src="bundle.js"></script></body>
</html>
`,
  );
}

async function buildFrameworkVariant(variant, app, outDir) {
  const options = frameworkBuildOptions(variant);
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', app.frameworkEntries[variant.framework])],
    bundle: true,
    minify: MINIFY,
    format: 'iife',
    // Solid's JSX is compiled by its plugin; no other JSX is bundled.
    jsx: 'preserve',
    conditions: ['browser', 'production'],
    define: {'process.env.NODE_ENV': '"production"', ...options.define},
    nodePaths: [path.join(ROOT, 'node_modules')],
    alias: options.alias,
    plugins: options.plugins,
    outfile: path.join(outDir, 'bundle.js'),
    logLevel: 'error',
  });
}

async function build() {
  const dist = path.join(ROOT, 'dist');
  fs.rmSync(dist, {recursive: true, force: true});
  const manifest = [];
  for (const variant of VARIANTS) {
    for (const app of APPS) {
      if (!variantHasApp(variant, app)) {
        continue;
      }
      const outDir = path.join(dist, variant.name, app.name);
      fs.mkdirSync(outDir, {recursive: true});
      const entry = {variant: variant.name, framework: variant.framework, app: app.name};
      if (variant.framework === 'react' || variant.framework === 'preact') {
        const {code, compiledFunctions} = await buildReactVariant(variant, app, outDir);
        const components = renderedComponents(code);
        Object.assign(entry, {
          react: variant.react ?? null,
          compiledFunctions,
          renderedComponents: components,
          blockTemplates: blockTemplateCount(code),
        });
        console.log(
          variant.framework === 'preact'
            ? `${variant.name} ${app.name}: React sources rendered by preact/compat`
            : `${variant.name} ${app.name}: ${compiledFunctions} compiled function(s); ${blockTemplateCount(code)} block template(s); components rendered as elements: ${components.join(', ')}`,
        );
      } else {
        await buildFrameworkVariant(variant, app, outDir);
        console.log(`${variant.name} ${app.name}: src/${app.frameworkEntries[variant.framework]}`);
      }
      writePage(outDir, app, variant);
      entry.bundleBytes = fs.statSync(path.join(outDir, 'bundle.js')).size;
      manifest.push(entry);
    }
  }
  fs.writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await build();
}
