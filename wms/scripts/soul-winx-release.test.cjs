// TEST: fail closed on drift and retain every non-Soul byte.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {patch}=require('./soul-winx-release.cjs');
test('rejects unknown production entry',()=>assert.throws(()=>patch('drift',''),/drift/));
test('keeps application intact and compiles verified personal account',async()=>{
 if(!process.env.WMS_WINX_ENTRY)throw Error('WMS_WINX_ENTRY required');
 const source=fs.readFileSync(process.env.WMS_WINX_ENTRY,'utf8'),compiled=await require('./soul-release.cjs').compile(),result=patch(source,compiled);
 const marker='\nlet __soulComponent;';assert.equal(result.split(marker)[0],source.split(marker)[0]);
 assert.ok(result.includes('8e175b30-8535-4881-9324-a875c9fd8c1d'));assert.ok(result.includes('/assets/soul-winx-20260929.png'));
 assert.ok(result.includes('data-soul-quick'));assert.throws(()=>patch(source+' ',compiled),/drift/);
});
