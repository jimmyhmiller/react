import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {ROOT,REPO,COMPILER,requireCompiler} from './config.mjs';
const babel=requireCompiler('@babel/core'),esbuild=requireCompiler('esbuild');
const plugin=requireCompiler('./packages/babel-plugin-react-compiler-rust/dist/index.js').default;
const preset=requireCompiler.resolve('@babel/preset-react'),local=path.join(REPO,'build/node_modules');
const original=JSON.parse(fs.readFileSync(path.join(ROOT,'dist/manifest.json'),'utf8'));
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const names=fs.readdirSync(path.join(ROOT,'src')).sort();
const sourceHash=hash(names.map(n=>`${n}\n${fs.readFileSync(path.join(ROOT,'src',n),'utf8')}`).join('\n'));
assert.equal(sourceHash,original.provenance.sourceHash,'The benchmark app source must remain identical');
assert.equal(hash(fs.readFileSync(path.join(local,'react-dom/cjs/react-dom-client.production.js'))),original.provenance.reactClientHash,'No reconciler changes in this experiment');
const report={sourceHash,appFiles:Object.fromEntries(names.map(n=>[n,hash(fs.readFileSync(path.join(ROOT,'src',n)))])),nativeHash:hash(fs.readFileSync(path.join(COMPILER,'packages/babel-plugin-react-compiler-rust/native/index.node'))),compilerRuntimeHash:hash(fs.readFileSync(path.join(local,'react/cjs/react-compiler-runtime.production.js'))),reactClientHash:original.provenance.reactClientHash,created:new Date().toISOString(),variants:[]};
for(const mask of [20,222])for(const enabled of [false,true]){
 const id=`key-${mask}-${enabled?'on':'off'}`,out=path.join(ROOT,'results',id);fs.mkdirSync(out,{recursive:true});
 const environment={...original.variants.find(v=>v.id===`context-${mask}`).environment,enableContextKeySpecialization:enabled};
 const modules=new Map(),events=[];
 for(const name of ['Editor.jsx','state-context.jsx']){
  const filename=path.join(ROOT,'src',name),source=fs.readFileSync(filename,'utf8');
  const {code}=babel.transformSync(source,{filename,babelrc:false,configFile:false,plugins:[[plugin,{target:'19',compilationMode:'infer',panicThreshold:'all_errors',environment,logger:{logEvent:(_f,e)=>events.push(e)}}]],presets:[[preset,{runtime:'automatic'}]]});
  assert.deepEqual(events.filter(e=>e.kind!=='CompileSuccess'),[]);
  if(!enabled)assert.equal(code,fs.readFileSync(path.join(ROOT,'dist',`context-${mask}`,name+'.compiled.js'),'utf8'),'Flag-off code must match the original compiler output');
  modules.set(filename,code);fs.writeFileSync(path.join(out,name+'.compiled.js'),code);
 }
 const specializedCalls=[...modules.values()].join('\n').match(/unstable_useContextKey\(/g)?.length??0;
 assert.equal(specializedCalls,enabled?1:0);
 await esbuild.build({absWorkingDir:ROOT,entryPoints:[path.join(ROOT,'src/main.jsx')],bundle:true,minify:true,jsx:'automatic',outfile:path.join(out,'app.js'),format:'iife',target:'es2020',alias:{react:path.join(local,'react'),'react-dom':path.join(local,'react-dom'),scheduler:path.join(local,'scheduler'),'@state':path.join(ROOT,'src/state-context.jsx')},define:{'process.env.NODE_ENV':'"production"','import.meta.env.PROD':'true',__VARIANT__:JSON.stringify(id),__VARIANT_LABEL__:JSON.stringify(id)},plugins:[{name:'actual-compiler',setup(build){build.onLoad({filter:/\.jsx$/},args=>modules.has(args.path)?{contents:modules.get(args.path),loader:'js'}:undefined);}}],logLevel:'silent'});
 fs.copyFileSync(path.join(ROOT,'dist/context-20/index.html'),path.join(out,'index.html'));
 report.variants.push({id,mask,enabled,environment,specializedCalls,compiledFunctions:events.length,moduleHashes:Object.fromEntries([...modules].map(([p,c])=>[path.basename(p),hash(c)])),bundleHash:hash(fs.readFileSync(path.join(out,'app.js')))});console.log('Built',id,'specialized calls:',specializedCalls);
}
fs.writeFileSync(path.join(ROOT,'results/key-manifest.json'),JSON.stringify(report,null,2));
