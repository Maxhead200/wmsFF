// TEST: execute the actual patched loading paths with read-only API stubs.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {patch}=require('./billing-opening-release.cjs');
test('rejects unexpected runtime',()=>assert.throws(()=>patch('changed'),/drift/));
test('runtime starts four calls, defers heavy tabs, and keeps sold behavior',async()=>{
 const response=await fetch('https://wms.logoff.pro/assets/themes-retired-20260929-5.js');assert.ok(response.ok);
 const source=patch(await response.text());
 const start=source.indexOf('function ia({session:t})'),end=source.indexOf('return e.jsxs("section",{className:"billing-panel"',start);
 assert.ok(start>=0&&end>start);
 const harness=source.slice(start,end)+'return {load:Ee};}';
 for(const [hostname,tab,expected] of [['wms.logoff.pro','invoices',4],['wms.logoff.pro','overview',6],['wms.logoff.pro','create',5],['sold.example','invoices',7]]){
  const calls=[],effects=[],states=[];let cursor=0;
  const context={window:{location:{hostname}},Jt:()=>true,$e:()=>['',()=>{}],pt:()=>'',Le:()=>'',Gi:()=>[],Wi:()=>({}),bs:()=>false,Lt:id=>id,re:err=>String(err),
   r:{useState:initial=>{const n=cursor++;let value=typeof initial==='function'?initial():initial;if(value==='invoices')value=tab;states[n]=value;return[value,next=>{states[n]=typeof next==='function'?next(states[n]):next;}]},useRef:initial=>({current:initial}),useMemo:fn=>fn(),useEffect:fn=>effects.push(fn)}};
  for(const name of ['At','mn','bn','xn','jn','Mt'])context[name]=async(...args)=>{calls.push([name,...args]);return name==='Mt'?{}:[];};
  vm.createContext(context);vm.runInContext(harness+';ia({session:{accessToken:"test",user:{id:"test"}}});',context);
  for(const effect of effects)effect();for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(calls.length,expected,hostname+' '+tab);
  if(hostname==='wms.logoff.pro'&&tab==='invoices'){assert.deepEqual(calls.map(c=>c[0]).sort(),['At','At','bn','xn']);assert.equal(states[5].status,'ready');}
  if(tab==='overview')assert.ok(calls.some(c=>c[0]==='Mt'));
  if(tab==='create')assert.ok(calls.some(c=>c[0]==='jn'));
 }
});
