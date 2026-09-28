// TEST: fail closed on drift; only Soul adapter and user binding may change.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {patchAppearance}=require('./soul-appearance-release.cjs'),{compile}=require('./soul-release.cjs');
test('rejects unknown production',()=>assert.throws(()=>patchAppearance('wrong',''),/drift/));
test('preserves full application and binds preferences to session user',async()=>{
 const source=fs.readFileSync(process.env.SOUL_CURRENT_ENTRY,'utf8'),out=patchAppearance(source,await compile());
 const boundary='\nlet __soulComponent;';
 assert.equal(out.split(boundary)[0].replace('userId:t.user.id,groups:A','groups:A'),source.split(boundary)[0]);
 assert.ok(out.includes('userId:t.user.id'));assert.ok(!out.includes('Всё на своих местах.'));
});
