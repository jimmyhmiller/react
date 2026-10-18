// Call counts only; this instrumented execution is never a timing sample.
import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from './config.mjs';
import {environment,openVariant} from './browser.mjs';
const ids=['context-0','context-20'];
const functions=['Entity','beginWork','attemptEarlyBailoutIfNoScheduledUpdate','updateFunctionComponent','checkIfContextChanged','selectedValuesChanged','createWorkInProgress','reduce'];
const env=await environment(),report={diagnosticOnly:true,variants:{}};
try{
 for(const id of ids){
  const dir=path.join(ROOT,'results','counts-'+id);fs.mkdirSync(dir,{recursive:true});
  const profileDir=path.join(ROOT,'results','profile-'+id);let source=fs.readFileSync(path.join(profileDir,'app.js'),'utf8');
  const instrumented=[];
  for(const name of functions){const pattern=new RegExp(`function ${name}\\([^)]*\\) \\{`);if(pattern.test(source)){source=source.replace(pattern,match=>match+`\n globalThis.__drawCounters.${name}=(globalThis.__drawCounters.${name}??0)+1;`);instrumented.push(name);}}
  fs.writeFileSync(path.join(dir,'app.js'),'globalThis.__drawCounters={};\n'+source);
  for(const file of ['index.html','app.css'])fs.copyFileSync(path.join(profileDir,file),path.join(dir,file));
  const{page,errors}=await openVariant(env,'results/counts-'+id);
  const counts=await page.evaluate(()=>{globalThis.__drawCounters={};window.drawBench.runTrial();const counts=structuredClone(globalThis.__drawCounters);window.drawBench.checkFinal();return counts;});
  if(errors.length)throw new Error(errors.join('\n'));
  report.variants[id]={instrumented,counts};console.log(id,counts);await page.close();
 }
 fs.writeFileSync(path.join(ROOT,'results/work-counts.json'),JSON.stringify(report,null,2));
}finally{await env.close();}
