import * as babel from '@babel/core';
import fs from 'fs';
const tsPlugin = require('../packages/babel-plugin-react-compiler/src').default;
const rustPlugin = require('../packages/babel-plugin-react-compiler-rust/src').default;
const file = process.argv[2];
const extra = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const src = fs.readFileSync(file, 'utf8');
for (const [name, plugin] of [['TS', tsPlugin], ['RUST', rustPlugin]] as const) {
  const events: any[] = [];
  const logger = {logEvent: (_f: string | null, e: any) => void events.push(e)};
  let code: string | null = null, err: string | null = null;
  try {
    const out = babel.transformSync(src, {
      filename: file, configFile: false, babelrc: false,
      parserOpts: {plugins: ['jsx']},
      plugins: [[plugin, {compilationMode: 'infer', panicThreshold: 'none', target: '19', logger, ...extra}]],
    });
    code = out?.code ?? null;
  } catch (e) { err = (e as Error).message; }
  console.log(`===== ${name} events: ${events.map(e => e.kind + (e.fnName ? ':' + e.fnName : '') + (e.detail?.reason ? ':' + e.detail.reason : '')).join(' | ')}`);
  if (err) console.log(`ERROR: ${err.slice(0, 300)}`);
  if (process.env.SHOW_CODE) console.log(code);
}
