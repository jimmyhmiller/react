// Structural comparison of <stem>.ts.js vs <stem>.swc.js pairs: regenerate both compactly from AST.
const babel = require('@babel/core'); const fs = require('fs'); const path = require('path');
const dirs = process.argv.slice(2);
function compact(code) {
  const shorthand = () => ({visitor: {ObjectProperty(p) { const n = p.node; if (!n.computed && n.key.type === 'Identifier' && n.value.type === 'Identifier' && n.key.name === n.value.name) n.shorthand = true; },
    VariableDeclaration(p) { if (p.node.kind === 'var') p.node.kind = 'let'; },
    ExportNamedDeclaration(p) { if (!p.node.declaration && p.node.specifiers.length === 0) p.remove(); }}});
  const r = babel.transformSync(code, {configFile: false, babelrc: false, parserOpts: {plugins: ['jsx']}, compact: true, comments: false, plugins: [shorthand], generatorOpts: {jsescOption: {minimal: true}, minified: true}});
  return r.code.replace(/\s+/g, '');
}
let same = 0, diff = 0;
for (const d of dirs) {
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith('.ts.js')) continue;
    const a = fs.readFileSync(path.join(d, f), 'utf8'), b = fs.readFileSync(path.join(d, f.replace(/\.ts\.js$/, '.swc.js')), 'utf8');
    let ca, cb; try { ca = compact(a); cb = compact(b); } catch (e) { console.log(`PARSE-FAIL ${f}: ${e.message.slice(0, 80)}`); continue; }
    if (ca === cb) { same++; continue; }
    diff++;
    let i = 0; while (i < ca.length && ca[i] === cb[i]) i++;
    console.log(`DIFF ${path.basename(d)}/${f}\n   ts : …${ca.slice(Math.max(0, i - 60), i + 90)}\n   swc: …${cb.slice(Math.max(0, i - 60), i + 90)}`);
  }
}
console.log(`\nformatting-only: ${same}, structural: ${diff}`);
