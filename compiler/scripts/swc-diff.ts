/**
 * Turbopack-path differential: TS babel-plugin-react-compiler vs swc_ecma_react_compiler (published core).
 * Both outputs are normalized through Babel's generator (no comments) + prettier before comparison.
 * Usage: ts-node swc-diff.ts <file-list> <out-dir>
 */
import * as babel from '@babel/core';
import {execFileSync} from 'child_process';
import fs from 'fs';
import path from 'path';
import prettier from 'prettier';
const [listPath, outDir] = process.argv.slice(2);
const DRIVER = process.env.SWC_DRIVER!;
const tsPlugin = require('../packages/babel-plugin-react-compiler/src').default;
fs.mkdirSync(path.join(outDir, 'diffs'), {recursive: true});
const files = fs.readFileSync(listPath, 'utf8').split('\n').filter(Boolean);
const out = fs.openSync(path.join(outDir, 'results.jsonl'), 'a');
function parserPlugins(file: string): any[] {
  const ext = path.extname(file);
  if (ext === '.ts') return ['typescript', 'decorators-legacy'];
  if (ext === '.tsx') return ['typescript', 'jsx', 'decorators-legacy'];
  return ['jsx', 'flow', 'decorators-legacy'];
}
async function normalize(code: string, file: string): Promise<string> {
  const isTs = path.extname(file).startsWith('.ts');
  // Noise filters: drop every import except the compiler runtime (Turbopack's TS strip elides
  // unused imports), force object-property shorthand, print unicode raw.
  const noisePlugin = () => ({
    visitor: {
      ImportDeclaration(p: any) { if (!/compiler-runtime$/.test(p.node.source.value)) p.remove(); },
      ObjectProperty(p: any) { const n = p.node; if (!n.computed && n.key.type === 'Identifier' && n.value.type === 'Identifier' && n.key.name === n.value.name) n.shorthand = true; },
    },
  });
  const re = babel.transformSync(code, {filename: file, configFile: false, babelrc: false, parserOpts: {plugins: parserPlugins(file)}, generatorOpts: {comments: false, jsescOption: {minimal: true}}, compact: false,
    presets: isTs ? [[require.resolve('@babel/preset-typescript'), {isTSX: path.extname(file) === '.tsx', allExtensions: true, onlyRemoveTypeImports: true}]] : [], plugins: [...(isTs ? [] : [require.resolve('@babel/plugin-transform-flow-strip-types')]), noisePlugin]});
  const formatted = await prettier.format(re?.code ?? '', {parser: 'babel'});
  // Fold compiler shadow-renames (`x_0` -> `x`; the swc frontend does not apply them) and JSX text entities.
  return formatted
    .replace(/\b([A-Za-z_$][\w$]*?)_\d+\b/g, '$1')
    .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, '\u00a0');
}
(async () => {
  for (const file of files) {
    let source: string; try { source = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const events: any[] = [];
    let tsCode: string | null = null, tsErr: string | null = null;
    try {
      const r = babel.transformSync(source, {filename: file, configFile: false, babelrc: false, parserOpts: {plugins: parserPlugins(file)}, plugins: [[tsPlugin, {compilationMode: 'infer', panicThreshold: 'none', target: '19', flowSuppressions: false, logger: {logEvent: (_f: any, e: any) => events.push(e)}}]]});
      tsCode = r?.code ?? null;
    } catch (e) { tsErr = (e as Error).message.slice(0, 200); }
    let swcCode: string | null = null, swcErr: string | null = null, swcEvents = '';
    try {
      const r = execFileSync(DRIVER, [file], {env: {...process.env, NODE_ENV: 'production'}, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024});
      swcCode = r;
    } catch (e: any) { swcErr = String(e.stderr ?? e.message).slice(0, 300); }
    const tsEv = events.filter(e => ['CompileError', 'CompileSuccess', 'CompileSkip'].includes(e.kind)).map(e => e.kind === 'CompileSuccess' ? `S:${e.fnName}` : `E:${e.detail?.reason?.slice(0, 50) ?? e.reason ?? ''}`);
    let status: string;
    if (tsErr && swcErr) status = 'both-error';
    else if (swcErr) status = 'swc-error';
    else if (tsErr) status = 'ts-error';
    else {
      let a = '', b = '';
      try { a = await normalize(tsCode!, file); } catch (e) { status = 'ts-unparseable'; }
      try { b = await normalize(swcCode!, file); } catch (e) { status = 'swc-unparseable:' + String((e as Error).message).slice(0, 120); }
      if (!status!) status = a === b ? 'same' : 'code-diff';
      if (status === 'code-diff') {
        const stem = path.basename(file);
        fs.writeFileSync(path.join(outDir, 'diffs', stem + '.ts.js'), a);
        fs.writeFileSync(path.join(outDir, 'diffs', stem + '.swc.js'), b);
      }
    }
    fs.writeSync(out, JSON.stringify({file, status, tsEvents: tsEv, tsErr, swcErr}) + '\n');
  }
})();
