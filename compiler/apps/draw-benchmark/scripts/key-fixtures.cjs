// Invoke snap's real worker/reporter with already-built compilers. The CLI
// wrapper additionally requires a globally available yarn for its build step.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../../../..');
process.chdir(path.join(repo,'compiler/packages/babel-plugin-react-compiler'));
const snap=path.join(repo,'compiler/packages/snap/dist');
const {getFixtures}=require(path.join(snap,'fixture-utils.js'));
const {transformFixture}=require(path.join(snap,'runner-worker.js'));
const {update,report}=require(path.join(snap,'reporter.js'));
const fixtures=path.join(repo,'compiler/packages/babel-plugin-react-compiler-rust/src/__tests__/fixtures/experimental');
(async()=>{
 if(process.argv.includes('--update')){
  const results=new Map();for(const [id,f] of await getFixtures({paths:['context-keys/*']},fixtures)){
   const r=await transformFixture(f,0,false,true,true);assert.equal(r.unexpectedError,null);results.set(id,r);
  }await update(results);
 }
 const results=new Map();for(const [id,f] of await getFixtures({paths:['context-keys/*','context-selectors/*']},fixtures)){
  const r=await transformFixture(f,0,false,true,true);assert.equal(r.unexpectedError,null);
  if(id==='context-keys/specialize-single-key')assert.equal((r.actual.split('## Code')[1]?.match(/unstable_useContextKey\(/g)??[]).length,3);
  if(id==='context-keys/retain-general-selections'||id==='context-keys/disabled-specialization')assert.ok(!r.actual.includes('unstable_useContextKey'));
  results.set(id,r);
 }
 if(!report(results,true,true,false))process.exitCode=1;
 fs.writeFileSync(path.join(repo,'compiler/apps/draw-benchmark/results/key-fixtures.json'),JSON.stringify({fixtures:results.size,passed:!process.exitCode,worker:'snap transformFixture/report',native:require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(repo,'compiler/packages/babel-plugin-react-compiler-rust/native/index.node'))).digest('hex')},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
