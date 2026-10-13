/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Compiles one file with the Rust React Compiler and prints the result, with
// any combination of the experimental flags (see docs/experiments/).
//
//   node scripts/experiment-compile.mjs <file> [flags]
//
//   --inlining     enableComponentInlining        (0001)
//   --blocks       enableJsxBlocks                (0002)
//   --lists        enableListItemMemoization      (0002)
//   --incremental  enableIncrementalListMapping   (0006)
//   --selectors    enableContextSelectors         (0003)
//   --slicing      enableUpdateSlicing            (0004)
//   --islands      enableStaticIslands            (0005)
//   --state        enableStateVariables           (0007)
//   --all          all of the above
//   --off          do not run the compiler at all
//   --env K=V      any other environment option (repeatable), e.g.
//                  --env enableForest=true
//   --jsx          also run @babel/preset-react, so the output calls _jsx
//                  instead of showing JSX (what a bundler actually ships)
//   --compare      print the output without the flags first, then with them
//   --prune        drop top level declarations nothing reaches, which is what a
//                  bundler does to a component the compiler inlined. The roots
//                  are the exported bindings, or the last declared component if
//                  the file exports nothing.
//   --root NAME    keep NAME (and what it uses) when pruning (repeatable)
//
// With no flags this is the standard compiler. Requires the Rust plugin to be
// built: `yarn snap --rust` from compiler/.

import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const FLAGS = {
  '--inlining': 'enableComponentInlining',
  '--blocks': 'enableJsxBlocks',
  '--lists': 'enableListItemMemoization',
  '--incremental': 'enableIncrementalListMapping',
  '--selectors': 'enableContextSelectors',
  '--slicing': 'enableUpdateSlicing',
  '--islands': 'enableStaticIslands',
  '--state': 'enableStateVariables',
};

function usage(message) {
  const flags = Object.keys(FLAGS).join(' ');
  console.error(
    `${message}\n\nUsage: node scripts/experiment-compile.mjs <file> [${flags} --all --off --env K=V --jsx --compare --prune --root NAME]`
  );
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    file: null,
    environment: {},
    off: false,
    jsx: false,
    compare: false,
    prune: false,
    roots: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') {
      for (const option of Object.values(FLAGS)) {
        args.environment[option] = true;
      }
    } else if (arg === '--off') {
      args.off = true;
    } else if (arg === '--jsx') {
      args.jsx = true;
    } else if (arg === '--prune') {
      args.prune = true;
    } else if (arg === '--root') {
      const name = argv[++i];
      if (name === undefined || name.startsWith('-')) {
        usage('--root needs a name, e.g. --root App');
      }
      args.roots.push(name);
      args.prune = true;
    } else if (arg === '--compare') {
      args.compare = true;
    } else if (arg === '--env') {
      const [key, value = 'true'] = (argv[++i] ?? '').split('=');
      if (key === '') {
        usage('--env needs an option, e.g. --env enableForest=true');
      }
      args.environment[key] =
        value === 'true' ? true : value === 'false' ? false : value;
    } else if (FLAGS[arg] !== undefined) {
      args.environment[FLAGS[arg]] = true;
    } else if (arg.startsWith('-')) {
      usage(`Unknown flag: ${arg}`);
    } else if (args.file === null) {
      args.file = path.resolve(arg);
    } else {
      usage(`Unexpected argument: ${arg}`);
    }
  }
  if (args.file === null) {
    usage('No file given.');
  }
  if (!fs.existsSync(args.file)) {
    usage(`No such file: ${args.file}`);
  }
  return args;
}

// Removes top level declarations that nothing reachable from the roots uses,
// and import specifiers left unused, repeating until nothing more can go. This
// is the dead code a bundler eliminates: after inlining, a component's own
// definition is still emitted but nobody renders it any more.
function prune(babel, code, file, roots) {
  const plugin = () => ({
    visitor: {
      Program: {
        exit(program) {
          const kept = roots.length !== 0 ? roots : defaultRoots(program);
          let removed = true;
          while (removed) {
            removed = false;
            program.scope.crawl();
            for (const statement of program.get('body')) {
              if (statement.isImportDeclaration()) {
                for (const specifier of statement.get('specifiers')) {
                  const binding = program.scope.getBinding(
                    specifier.node.local.name
                  );
                  if (binding !== undefined && !binding.referenced) {
                    specifier.remove();
                    removed = true;
                  }
                }
                // Keep the import for the module's side effects, even if
                // none of its bindings are used.
                continue;
              }
              const names = declaredNames(statement);
              if (
                names.length === 0 ||
                names.some(name => kept.includes(name))
              ) {
                continue;
              }
              const unused = names.every(name => {
                const binding = program.scope.getBinding(name);
                return binding !== undefined && !binding.referenced;
              });
              const pure =
                statement.isFunctionDeclaration() ||
                (statement.isVariableDeclaration() &&
                  statement.get('declarations').every(declaration => {
                    const init = declaration.get('init');
                    return !init.node || init.isPure();
                  })) ||
                (statement.isClassDeclaration() && statement.isPure());
              if (unused && pure) {
                statement.remove();
                removed = true;
              }
            }
          }
        },
      },
    },
  });
  return babel.transformSync(code, {
    filename: file,
    babelrc: false,
    configFile: false,
    parserOpts: {plugins: ['jsx', 'typescript']},
    plugins: [plugin],
  }).code;
}

function declaredNames(statement) {
  if (statement.isFunctionDeclaration() || statement.isClassDeclaration()) {
    return statement.node.id === null ? [] : [statement.node.id.name];
  }
  if (statement.isVariableDeclaration()) {
    return statement.node.declarations.flatMap(declaration =>
      declaration.id.type === 'Identifier' ? [declaration.id.name] : []
    );
  }
  return [];
}

// Exported bindings, or the last declared component if nothing is exported.
function defaultRoots(program) {
  const exported = [];
  let lastComponent = null;
  for (const statement of program.get('body')) {
    if (
      statement.isExportNamedDeclaration() ||
      statement.isExportDefaultDeclaration()
    ) {
      exported.push(...declaredNames(statement.get('declaration')));
      for (const specifier of statement.node.specifiers ?? []) {
        exported.push(specifier.local.name);
      }
    }
    for (const name of declaredNames(statement)) {
      if (/^[A-Z]/.test(name)) {
        lastComponent = name;
      }
    }
  }
  if (exported.length !== 0) {
    return exported;
  }
  return lastComponent === null ? [] : [lastComponent];
}

function compile(file, environment, {off, jsx, prune: shouldPrune, roots}) {
  const babel = require(path.join(ROOT, 'node_modules/@babel/core'));
  const plugins = [];
  const events = [];
  if (!off) {
    const pluginPath = path.join(
      ROOT,
      'packages/babel-plugin-react-compiler-rust/dist/index.js'
    );
    if (!fs.existsSync(pluginPath)) {
      usage(
        `The Rust plugin is not built (${pluginPath}). Run: yarn snap --rust`
      );
    }
    plugins.push([
      require(pluginPath).default,
      {
        target: '19',
        compilationMode: 'infer',
        panicThreshold: 'all_errors',
        environment,
        logger: {logEvent: (_filename, event) => events.push(event)},
      },
    ]);
  }
  const presets = jsx
    ? [
        [
          path.join(ROOT, 'node_modules/@babel/preset-react'),
          {runtime: 'automatic'},
        ],
      ]
    : [];
  let code;
  try {
    ({code} = babel.transformSync(fs.readFileSync(file, 'utf8'), {
      filename: file,
      babelrc: false,
      configFile: false,
      parserOpts: {plugins: ['jsx', 'typescript']},
      plugins,
      presets,
    }));
  } catch (error) {
    // The compiler's own diagnostics read better than a node stack trace.
    console.error(error.message);
    process.exit(1);
  }
  if (shouldPrune) {
    code = prune(babel, code, file, roots);
  }
  return {code, events};
}

function describe(environment) {
  const enabled = Object.keys(environment);
  return enabled.length === 0 ? 'standard compiler' : enabled.join(', ');
}

function report(label, {code, events}) {
  console.log(`// ${label}`);
  console.log(code);
  const failures = events.filter(event => event.kind !== 'CompileSuccess');
  const summary =
    events.length === 0
      ? 'nothing compiled'
      : `${events.length} function(s) compiled`;
  console.error(`\n${label}: ${summary}`);
  for (const failure of failures) {
    console.error(
      `  ${failure.kind}: ${failure.fnLoc?.start?.line ?? '?'} ${failure.detail?.reason ?? ''}`
    );
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.compare) {
  report('standard compiler', compile(args.file, {}, args));
  console.log();
}
report(
  args.off ? 'no compiler' : describe(args.environment),
  compile(args.file, args.environment, args)
);
