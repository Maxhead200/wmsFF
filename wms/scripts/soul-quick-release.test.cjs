// TEST: quick access release must preserve the published application outside Soul.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {patch}=require('./soul-quick-release.cjs');
test('rejects unexpected production entry',()=>assert.throws(()=>patch('drift',''),/drift/));
test('replaces only Soul adapter and retains user-scoped props',async()=>{
 if(!process.env.WMS_QUICK_ENTRY)throw Error('WMS_QUICK_ENTRY is required for release validation');
 const source=fs.readFileSync(process.env.WMS_QUICK_ENTRY,'utf8'),compiled=await require('./soul-release.cjs').compile(),result=patch(source,compiled);
 const marker='\nlet __soulComponent;';assert.equal(result.split(marker)[0],source.split(marker)[0]);
 assert.ok(result.includes('data-soul-quick'));assert.ok(result.includes('userId:t.user.id,groups:A'));assert.throws(()=>patch(source+' ',compiled),/drift/);
});
