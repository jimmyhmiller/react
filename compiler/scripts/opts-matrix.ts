import * as babel from '@babel/core';
import fs from 'fs';
const tsPlugin = require('../packages/babel-plugin-react-compiler/src').default;
const rustPlugin = require('../packages/babel-plugin-react-compiler-rust/src').default;
const S = process.argv[2];
const cases: Array<[string, Record<string, unknown>]> = [
  ['error-ref.jsx', {panicThreshold: 'all_errors'}],
  ['error-ref.jsx', {panicThreshold: 'critical_errors'}],
  ['annotation.jsx', {compilationMode: 'annotation'}],
  ['annotation.jsx', {compilationMode: 'syntax'}],
  ['use-no-memo.jsx', {}],
  ['use-no-memo.jsx', {ignoreUseNoForget: true}],
  ['program-use-no-memo.jsx', {}],
  ['custom-opt-out.jsx', {customOptOutDirectives: ['use custom-opt-out']}],
  ['eslint-suppress.jsx', {}],
  ['eslint-suppress.jsx', {eslintSuppressionRules: ['react-hooks/rules-of-hooks']}],
  ['simple.jsx', {target: {kind: 'donotuse_meta_internal', runtimeModule: 'react-forget-runtime'}}],
  ['simple.jsx', {target: '17'}],
  ['simple.jsx', {compilationMode: 'Infer'}],
  ['simple.jsx', {panicThreshold: 'NONE'}],
  ['simple.jsx', {noEmit: true}],
  ['simple.jsx', {outputMode: 'ssr'}],
  ['simple.jsx', {environment: {enableEmitFreeze: {source: 'react-compiler-runtime', importSpecifierName: 'makeReadOnly'}}}],
  ['simple.jsx', {environment: {enableEmitHookGuards: {source: 'react-compiler-runtime', importSpecifierName: '$dispatcherGuard'}}}],
  ['simple.jsx', {environment: {enableEmitInstrumentForget: {fn: {source: 'react-compiler-runtime', importSpecifierName: 'useRenderCounter'}, gating: null, globalGating: null}}}],
];
function run(plugin: any, file: string, opts: Record<string, unknown>) {
  const events: any[] = [];
  const logger = {logEvent: (_f: string | null, e: any) => void events.push(e)};
  let code: string | null = null, err: string | null = null;
  try {
    const out = babel.transformSync(fs.readFileSync(file, 'utf8'), {
      filename: file, configFile: false, babelrc: false, parserOpts: {plugins: ['jsx']},
      plugins: [[plugin, {logger, ...opts}]],
    });
    code = out?.code ?? null;
  } catch (e) { err = (e as Error).message.split('\n')[0].slice(0, 120); }
  const ev = events.map(e => e.kind.replace('Compile', '') + (e.fnName ? ':' + e.fnName : '') + (e.detail?.reason ? ':' + e.detail.reason.slice(0, 40) : '')).join(' | ');
  return {code, err, ev};
}
for (const [f, opts] of cases) {
  const file = `${S}/${f}`;
  const a = run(tsPlugin, file, opts), b = run(rustPlugin, file, opts);
  const same = a.code === b.code && a.err === b.err && a.ev === b.ev;
  console.log(`${same ? 'SAME' : 'DIFF'}  ${f} ${JSON.stringify(opts)}`);
  if (!same) {
    console.log(`   TS   ev=[${a.ev}] err=${a.err}`);
    console.log(`   RUST ev=[${b.ev}] err=${b.err}`);
    if (a.code !== b.code && a.code && b.code) {
      const al = a.code.split('\n'), bl = b.code.split('\n');
      for (let i = 0; i < Math.max(al.length, bl.length); i++) if (al[i] !== bl[i]) { console.log(`   line ${i+1}:\n     TS  : ${al[i]}\n     RUST: ${bl[i]}`); break; }
    } else if (a.code == null || b.code == null) console.log(`   code: ts=${a.code == null ? 'null' : 'ok'} rust=${b.code == null ? 'null' : 'ok'}`);
  }
}
