// TEST: verify real pinned runtime choices and saved preferences without running the app or API.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {patch}=require('./retire-themes-release.cjs');
test('rejects drift',()=>assert.throws(()=>patch('changed'),/drift/));
test('published runtime retires choices only on our host and retains personal access',async()=>{
 const response=await fetch('https://wms.logoff.pro/assets/soul-appearance-20260929-0.js');assert.ok(response.ok);
 const result=patch(await response.text());
 const options=result.slice(result.indexOf('o2=[')+3,result.indexOf(',K5=new Set'));
 const loader=result.slice(result.indexOf('function Tj('),result.indexOf('function yp('));
 for(const hostname of ['wms.logoff.pro','sold.example']){
  const context={window:{location:{hostname},localStorage:{getItem:()=>context.saved}},saved:'classic',c2:id=>id,Rj:()=>false};
  vm.createContext(context);vm.runInContext('var o2='+options+';'+loader,context);
  for(const value of ['classic','spirit','space','future3100','obsidian','aerospace']){
   context.saved=value;
   assert.equal(vm.runInContext('o2.some(o=>o.value===saved)',context),hostname!=='wms.logoff.pro');
   assert.equal(vm.runInContext('Tj({id:"test"})',context),hostname==='wms.logoff.pro'?'modern':value);
  }
  context.saved='winx';assert.equal(vm.runInContext('Tj({id:"test"})',context),hostname==='wms.logoff.pro'?'modern':'classic');
  for(const value of ['modern','polar','la_panthera']){context.saved=value;assert.equal(vm.runInContext('Tj({id:"test"})',context),value);}
 }
});
