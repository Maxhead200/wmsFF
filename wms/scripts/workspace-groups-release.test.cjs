// TEST: evaluate the exact published navigation replacement, not a UI approximation.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {patch,compileGroups,after}=require('./workspace-groups-release.cjs');
test('release fails closed on unexpected production code',()=>assert.throws(()=>patch('unexpected',''),/drift/));
test('runtime grouping keeps permissions and isolates sold WMS',()=>{
 const input=[{id:'monitoring',permissions:['ADMIN']},{id:'integration-api'},{id:'fbs'},{id:'billing'},{id:'directories'}];
 const oldGroups=[{id:'control',title:'Контроль'},{id:'management',title:'Управление'},{id:'client',title:'Клиентский контур'}];
 const legacy=id=>id==='monitoring'?'control':id==='fbs'?'client':'management';
 const context={G5:oldGroups,nU:legacy,window:{location:{hostname:'wms.logoff.pro'}},input,result:null};vm.createContext(context);
 vm.runInContext(compileGroups()+after+';result=u2(input)',context);
 assert.deepEqual(Array.from(context.result,g=>g.id),['marketplaces','management','finance']);
 assert.deepEqual(Array.from(context.result[1].items,i=>i.id),['monitoring','integration-api','directories']);
 assert.equal(context.result[1].items[0],input[0]);
 context.window.location.hostname='sold.example';vm.runInContext('result=u2(input)',context);
 assert.deepEqual(Array.from(context.result,g=>g.id),['control','management','client']);
});
test('pinned live entry accepts only the bounded adapter and grouping change',async()=>{
 if(!process.env.WMS_MENU_ENTRY)return;
 const source=fs.readFileSync(process.env.WMS_MENU_ENTRY,'utf8'),compiled=await require('./soul-release.cjs').compile();
 const result=patch(source,compiled);assert.ok(result.includes(after));assert.ok(result.includes('userId:t.user.id,groups:A'));
 assert.ok(result.includes('soul-brand'));assert.throws(()=>patch(source+' ',compiled),/drift/);
});
