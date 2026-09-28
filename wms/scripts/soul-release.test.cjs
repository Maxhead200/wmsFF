const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {patchMain,compile}=require('./soul-release.cjs');
// TEST: adapter refuses unknown production and preserves all original page arguments.
test('rejects stale runtime',()=>assert.throws(()=>patchMain('old',''),/drift/));
test('compiled component contains no demo data or API client',async()=>{const js=await compile();assert.ok(js.includes('SoulWorkspace'));assert.ok(!/ДЕМО-|fetch\(|sessionStorage/.test(js));});
test('patch retains published handlers, session arguments and every other theme',async()=>{
 const source=fs.readFileSync(process.env.SOUL_ORIGINAL_ENTRY,'utf8'),output=patchMain(source,await compile());
 assert.ok(output.includes('children:J5(se.id,t,G,v,m,b,S,q,ne=>{$(ne),v("requests")},()=>$(null),d,l)'));
 for(const name of ['la_panthera','spirit','winx','space'])assert.ok(output.includes(`value:"${name}"`));
 assert.throws(()=>patchMain(source+' ',''),/drift/);
});
