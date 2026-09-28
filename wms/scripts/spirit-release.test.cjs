const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {patchMain,patchAnalytics}=require('./spirit-release.cjs');
// TEST: fail closed on concurrent deployments and preserve unrelated runtime exactly.
test('rejects unknown main and analytics bundles',()=>{
 assert.throws(()=>patchMain('old'),/drift/);assert.throws(()=>patchAnalytics('old',''),/drift/);
});
test('only adds theme option to pinned runtime',()=>{
 const p=process.env.SPIRIT_SNAPSHOT;if(!p)throw Error('SPIRIT_SNAPSHOT required');
 const main=fs.readFileSync(p+'/current.js','utf8');
 assert.equal(patchMain(main).replace(',{value:"spirit",label:"Spirit"}',''),main);
 const analytics=fs.readFileSync(p+'/analytics.js','utf8');
 const next=patchAnalytics(analytics,'const SpiritBuild={SpiritChart:()=>null};');
 assert.ok(next.includes('value:p.orderSum'));assert.ok(next.includes('onSelect:i=>C(H[i])'));
});
