/**
 * Differential test: compile each file with the TS and Rust React Compiler
 * plugins and record any difference in output code or compile events.
 *
 * Usage: npx tsx compiler/scripts/diff-corpus.ts <file-list> <out-dir> [--start N]
 */
import * as babel from '@babel/core';
import fs from 'fs';
import path from 'path';
import hermesParserPlugin from 'babel-plugin-syntax-hermes-parser';

const [listPath, outDir] = process.argv.slice(2);
const startIdx = (() => {
  const i = process.argv.indexOf('--start');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 0;
})();
const files = fs.readFileSync(listPath, 'utf8').split('\n').filter(Boolean);
fs.mkdirSync(outDir, {recursive: true});
const diffDir = path.join(outDir, 'diffs');
fs.mkdirSync(diffDir, {recursive: true});

const tsPlugin = require('../packages/babel-plugin-react-compiler/src').default;
const rustPlugin =
  require('../packages/babel-plugin-react-compiler-rust/src').default;

interface LoggerEvent {
  kind: string;
  fnName?: string | null;
  reason?: string;
  detail?: {reason?: string; severity?: string; category?: string; description?: string};
  data?: string;
}

function parserPlugins(file: string): babel.ParserOptions['plugins'] {
  const ext = path.extname(file);
  if (ext === '.ts') return ['typescript', 'decorators-legacy', 'explicitResourceManagement'];
  if (ext === '.tsx') return ['typescript', 'jsx', 'decorators-legacy', 'explicitResourceManagement'];
  return ['jsx', 'flow', 'decorators-legacy', 'explicitResourceManagement'];
}

function compile(mode: 'ts' | 'rust', file: string, source: string) {
  const events: LoggerEvent[] = [];
  const logger = {logEvent: (_f: string | null, e: LoggerEvent) => void events.push(e)};
  const extra = process.env.DIFF_OPTS ? JSON.parse(process.env.DIFF_OPTS) : {};
  const opts = {
    compilationMode: 'infer',
    panicThreshold: 'none',
    target: '19',
    sources: null,
    enableReanimatedCheck: false,
    environment: {},
    ...extra,
    logger,
  };
  try {
    const ext = path.extname(file);
    const useHermes = process.env.DIFF_HERMES === '1' && (ext === '.js' || ext === '.jsx');
    const compilerPlugin = [mode === 'ts' ? tsPlugin : rustPlugin, opts];
    const result = babel.transformSync(source, {
      filename: file,
      sourceType: (process.env.DIFF_SOURCE_TYPE as 'module' | 'script' | 'unambiguous') ?? 'module',
      parserOpts: useHermes ? {} : {plugins: parserPlugins(file)},
      plugins: useHermes ? [[hermesParserPlugin, {parseLangTypes: 'flow'}], compilerPlugin] : [compilerPlugin],
      configFile: false,
      babelrc: false,
      compact: false,
      retainLines: false,
    });
    return {code: result?.code ?? null, events, error: null as string | null};
  } catch (e) {
    return {code: null, events, error: e instanceof Error ? e.message : String(e)};
  }
}

function fmtEvents(events: LoggerEvent[]): string[] {
  return events
    .filter(e => ['CompileError', 'CompileSkip', 'CompileSuccess', 'PipelineError', 'CompileUnexpectedThrow'].includes(e.kind))
    .map(e => {
      if (e.kind === 'CompileSuccess') return `[CompileSuccess] ${e.fnName ?? '(anonymous)'}`;
      if (e.kind === 'CompileError') {
        const d = e.detail;
        return `[CompileError] ${d?.reason ?? ''} (${d?.severity ?? ''}, ${d?.category ?? ''})`;
      }
      if (e.kind === 'CompileSkip') return `[CompileSkip] ${e.reason ?? ''}`;
      return `[${e.kind}] ${(e.data ?? '').slice(0, 200)}`;
    });
}

const resultsPath = path.join(outDir, 'results.jsonl');
const out = fs.openSync(resultsPath, 'a');
const currentPath = path.join(outDir, 'current');
let n = 0;
for (let i = startIdx; i < files.length; i++) {
  const file = files[i];
  fs.writeFileSync(currentPath, `${i} ${file}\n`);
  let source: string;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const ts = compile('ts', file, source);
  const rust = compile('rust', file, source);
  const tsEv = fmtEvents(ts.events);
  const rustEv = fmtEvents(rust.events);
  const tsParseError = ts.error != null && ts.code == null && ts.events.length === 0;
  let status: string;
  if (ts.error != null && rust.error != null && tsParseError) status = 'parse-error';
  else if (rust.error != null && ts.error == null) status = 'rust-throw';
  else if (ts.error != null && rust.error == null) status = 'ts-throw';
  else if (ts.code !== rust.code) status = 'code-diff';
  else if (tsEv.join('\n') !== rustEv.join('\n')) status = 'events-diff';
  else status = 'same';
  const rec: Record<string, unknown> = {i, file, status, tsEvents: tsEv, rustEvents: rustEv};
  if (status !== 'same') {
    rec.tsError = ts.error;
    rec.rustError = rust.error;
  }
  if (status !== 'same' && status !== 'parse-error') {
    const stem = `${String(i).padStart(5, '0')}-${path.basename(file)}`;
    if (ts.code != null) fs.writeFileSync(path.join(diffDir, stem + '.ts-out.js'), ts.code);
    if (rust.code != null) fs.writeFileSync(path.join(diffDir, stem + '.rust-out.js'), rust.code);
  }
  fs.writeSync(out, JSON.stringify(rec) + '\n');
  n++;
  if (n % 100 === 0) process.stderr.write(`${i + 1}/${files.length}\n`);
}
fs.closeSync(out);
process.stderr.write(`done ${files.length}\n`);
