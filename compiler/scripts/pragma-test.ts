import * as babel from '@babel/core';
import fs from 'fs';
const tsPlugin = require('../packages/babel-plugin-react-compiler/src').default;
const rustPlugin = require('../packages/babel-plugin-react-compiler-rust/src').default;
const file = process.argv[2];
const src = fs.readFileSync(file, 'utf8');
for (const [name, plugin] of [['TS', tsPlugin], ['RUST', rustPlugin]] as const) {
  const out = babel.transformSync(src, {
    filename: file,
    configFile: false, babelrc: false,
    parserOpts: {plugins: ['jsx']},
    plugins: [[plugin, {compilationMode: 'infer', panicThreshold: 'none', target: '19'}]], presets: [['@babel/preset-react', {runtime: 'automatic'}]],
  });
  console.log(`===== ${name}\n${out?.code}\n`);
}
