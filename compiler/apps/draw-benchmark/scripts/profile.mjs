// Separate diagnostic bundles. Never use these durations as benchmark results.
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, REPO, requireCompiler} from './config.mjs';
import {environment, openVariant} from './browser.mjs';
const esbuild=requireCompiler('esbuild');
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'dist/manifest.json'),'utf8'));
const confirmation=JSON.parse(fs.readFileSync(path.join(ROOT,'results/confirmation.json'),'utf8'));
if(!confirmation.complete)throw new Error('Wait until timed confirmation is complete');
const winners=['context','store'].map(arch=>confirmation.summary.find(r=>r.id.startsWith(arch+'-')).id);
const ids=[...new Set(['context-0',...winners,'store-0'])];
const local=path.join(REPO,'build/node_modules');
const summary={diagnosticOnly:true,note:'Separate non-minified production bundles, CPU sampling enabled. Percentages are diagnostic samples, not benchmark timings.',provenance:manifest.provenance,variants:{}};
const env=await environment();
try{
 for(const id of ids){
  const variant=manifest.variants.find(v=>v.id===id),output=path.join(ROOT,'results','profile-'+id);
  fs.mkdirSync(output,{recursive:true});
  const modules=new Map(['Editor.jsx',`state-${variant.architecture}.jsx`].map(name=>[path.join(ROOT,'src',name),fs.readFileSync(path.join(ROOT,'dist',id,name+'.compiled.js'),'utf8')]));
  await esbuild.build({absWorkingDir:ROOT,entryPoints:[path.join(ROOT,'src/main.jsx')],bundle:true,minify:false,keepNames:true,jsx:'automatic',outfile:path.join(output,'app.js'),format:'iife',target:'es2020',alias:{react:path.join(local,'react'),'react-dom':path.join(local,'react-dom'),scheduler:path.join(local,'scheduler'),'@state':path.join(ROOT,'src',`state-${variant.architecture}.jsx`)},define:{'process.env.NODE_ENV':'"production"','import.meta.env.PROD':'true',__VARIANT__:JSON.stringify(id),__VARIANT_LABEL__:JSON.stringify('PROFILE / '+id)},plugins:[{name:'compiled',setup(build){build.onLoad({filter:/\.jsx$/},args=>modules.has(args.path)?{contents:modules.get(args.path),loader:'js'}:undefined);}}],logLevel:'silent'});
  let html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8').replace('<script type="module" src="/src/main.jsx"></script>','<script src="./app.js"></script>').replace('</head>','<link rel="stylesheet" href="./app.css"></head>');
  fs.writeFileSync(path.join(output,'index.html'),html);
  const {page,errors}=await openVariant(env,'results/profile-'+id);
  await page.evaluate(()=>window.drawBench.runTrial());
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:250});await cdp.send('Profiler.start');
  await page.evaluate(()=>{window.drawBench.runTrial();});
  const {profile}=await cdp.send('Profiler.stop');await cdp.send('Profiler.disable');
  if(errors.length)throw new Error(errors.join('\n'));
  fs.writeFileSync(path.join(output,'cpu.cpuprofile'),JSON.stringify(profile));
  const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map();for(const n of profile.nodes)for(const child of n.children??[])parents.set(child,n.id);
  const self=new Map(),inclusive=new Map();let total=0;
  for(let i=0;i<profile.samples.length;i++){const us=profile.timeDeltas[i]??0;total+=us;let n=nodes.get(profile.samples[i]);const key=n.callFrame.functionName||'(anonymous)';self.set(key,(self.get(key)??0)+us);const seen=new Set();while(n){const key=n.callFrame.functionName||'(anonymous)';if(!seen.has(key)){inclusive.set(key,(inclusive.get(key)??0)+us);seen.add(key);}n=nodes.get(parents.get(n.id));}}
  const ranked=map=>[...map].sort((a,b)=>b[1]-a[1]).slice(0,35).map(([name,us])=>({name,percent:Math.round(us/total*1000)/10}));
  summary.variants[id]={self:ranked(self),inclusive:ranked(inclusive),samples:profile.samples.length};
  console.log(id,JSON.stringify(summary.variants[id].self.slice(0,12)));
  await page.close();
 }
 fs.writeFileSync(path.join(ROOT,'results/profile-summary.json'),JSON.stringify(summary,null,2));
}finally{await env.close();}
