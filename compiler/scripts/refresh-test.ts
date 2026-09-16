import * as babel from '@babel/core';
import fs from 'fs';
import path from 'path';
const S = process.argv[2];
// Build react-refresh/babel from React's own Flow source.
const src = fs.readFileSync(path.resolve(__dirname, '../../packages/react-refresh/src/ReactFreshBabelPlugin.js'), 'utf8');
const built = babel.transformSync(src, {configFile: false, babelrc: false, presets: ['@babel/preset-flow'], plugins: ['@babel/plugin-transform-modules-commonjs']})!.code!;
const outPath = path.join(S, 'ReactFreshBabelPlugin.cjs');
fs.writeFileSync(outPath, built);
const refresh = require(outPath).default ?? require(outPath);
const tsPlugin = require('../packages/babel-plugin-react-compiler/src').default;
const rustPlugin = require('../packages/babel-plugin-react-compiler-rust/src').default;
const files = process.argv.slice(3);
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const outs: Record<string, string> = {};
  for (const [name, plugin] of [['TS', tsPlugin], ['RUST', rustPlugin]] as const) {
    try {
      const out = babel.transformSync(source, {
        filename: file, configFile: false, babelrc: false, parserOpts: {plugins: ['jsx']},
        plugins: [[plugin, {compilationMode: 'infer', panicThreshold: 'none', target: '19'}], [refresh, {skipEnvCheck: true}]],
        presets: [['@babel/preset-react', {runtime: 'automatic'}]],
      });
      outs[name] = out?.code ?? '';
    } catch (e) { outs[name] = 'ERROR: ' + (e as Error).message; }
  }
  const same = outs.TS === outs.RUST;
  console.log(`${same ? 'SAME' : 'DIFF'} ${path.basename(file)}`);
  if (!same || process.env.SHOW_CODE) {
    const a = outs.TS.split('\n'), b = outs.RUST.split('\n');
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) console.log(`  L${i+1}\n    TS  : ${a[i]}\n    RUST: ${b[i]}`);
  }
}
