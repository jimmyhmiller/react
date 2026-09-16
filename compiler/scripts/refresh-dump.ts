import * as babel from '@babel/core';
import fs from 'fs';
import path from 'path';
const S = process.argv[2]; const file = process.argv[3];
const refresh = require(path.join(S, 'ReactFreshBabelPlugin.cjs')).default;
const tsPlugin = require('../packages/babel-plugin-react-compiler/src').default;
const rustPlugin = require('../packages/babel-plugin-react-compiler-rust/src').default;
for (const [name, plugin] of [['ts', tsPlugin], ['rust', rustPlugin]] as const) {
  const out = babel.transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file, configFile: false, babelrc: false, parserOpts: {plugins: ['jsx']},
    plugins: [[plugin, {compilationMode: 'infer', panicThreshold: 'none', target: '19'}], [refresh, {skipEnvCheck: true}]],
    presets: [['@babel/preset-react', {runtime: 'automatic'}]],
  });
  fs.writeFileSync(path.join(S, `avatar-refresh-${name}.js`), out!.code!);
}
