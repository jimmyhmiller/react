import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from './config.mjs';
const load=name=>JSON.parse(fs.readFileSync(path.join(ROOT,name),'utf8'));
const manifest=load('dist/manifest.json'), report=load('results/confirmation.json'), verification=load('results/correctness.json'), screen=load('results/screen.json');
if(!report.complete||!screen.complete)throw new Error('Measurement incomplete');
const variant=id=>manifest.variants.find(v=>v.id===id);
const f=n=>n.toFixed(1);
const lines=['# Local DRAW results','',`Measured with the local build of \`${manifest.provenance.branch}\` at \`${manifest.provenance.commit}\`.`, '',`${report.cpu}; ${report.browser}; ${report.headless?'headless':'visible'} Chrome. Screening: ${screen.warmups} warmups + ${screen.trials} trials per distinct output. Independent finalist confirmation: ${report.warmups} warmups + ${report.trials} trials.`, '',`${manifest.variants.length} valid configurations; ${new Set(manifest.variants.map(v=>v.representative)).size} distinct generated outputs. ${verification.passed.length} outputs passed all 5,000 synchronous commit checks, manual editing, final-state and normalized shape-DOM comparison; ${verification.failures.length} verification failures.`, ''];
for(const architecture of ['context','store']){
 const rows=report.summary.filter(r=>r.id.startsWith(architecture+'-')), best=rows[0];
 const plain=rows.find(r=>r.id===architecture+'-off'), compiler=rows.find(r=>r.id===architecture+'-0');
 lines.push(`## ${architecture==='context'?'Context map':'Entity external store'}`, '',`Lowest confirmed median: **${variant(best.id).label}** (\`${best.id}\`): **${f(best.medianMs)} ms**, IQR ${f(best.p25)}–${f(best.p75)} ms.`, '',`Relative to compiler-only on the same local runtime: **${(compiler.medianMs/best.medianMs).toFixed(2)}×**. Relative to compiler-off: **${(plain.medianMs/best.medianMs).toFixed(2)}×**.`, '', '| Configuration | Median ms | p25–p75 ms | Raw ms |', '| --- | ---: | --- | --- |');
 for(const row of rows)lines.push(`| ${variant(row.id).label} | ${f(row.medianMs)} | ${f(row.p25)}–${f(row.p75)} | ${row.rawMs.map(f).join(', ')} |`);
 const near=rows.filter(r=>r.id!==best.id&&r.medianMs<=best.medianMs*1.05);
 if(near.length)lines.push('',`Within 5% of this median: ${near.map(r=>'`'+r.id+'`').join(', ')}. These are near-ties; do not interpret their rank as a reliable general advantage.`);
 const aliases=manifest.variants.filter(v=>v.representative===best.id&&v.id!==best.id);
 if(aliases.length)lines.push('',`The following configurations generate byte-identical editor/adapter code and share this result: ${aliases.map(v=>'`'+v.id+'`').join(', ')}. See the manifest for flags; enabling a no-op flag is not a separate speedup.`);
 lines.push('');
}
lines.push('## Limits', '', 'This is the inferred 999-box + one-label logo trace, not the original DRAW recording. All numbers measure synchronous UI event dispatch, state work, React render/commit and GC. They exclude subsequent layout and paint. Context/store comparisons change architecture; compiler-only comparisons keep architecture and local runtime fixed. The matrix toggles compiler transformations while retaining runtime support for all experiments. A fastest median is specific to this workload/build/machine, and finalists were selected from a shorter screening run, not an exhaustive nine-trial run of every output.', '', 'Full raw samples, execution order, source/native/runtime hashes and compiler output are available in `results/` and `dist/manifest.json`. Read README.md for reproduction commands.');
lines.push('', '## Bottleneck investigation', '', 'See [PROFILING.md](PROFILING.md) for the separate diagnostic profiles and call counts explaining the modest Context gain.');
fs.writeFileSync(path.join(ROOT,'RESULTS.md'),lines.join('\n')+'\n');
console.log('Wrote RESULTS.md');
