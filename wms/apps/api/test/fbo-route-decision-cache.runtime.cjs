// TEST: exact production ordering remains identical with memoized decisions, including mixed boxes.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {cacheFboBoxDecision}=require('/app/apps/api/dist/modules/tsd/fbo-request-route.js');
const {prioritizeFboWholeBoxes,wholeBoxDecision}=require('/app/apps/api/dist/modules/tsd/fbo-two-stage-policy.js');
test('unchanged route and fewer evaluations across varying SKU demands',()=>{
 for(let seed=1;seed<=12;seed++){
  const boxes=Array.from({length:80},(_,i)=>({id:i,balances:[{skuId:'s'+i%8,quantity:(i+seed)%4+1,status:'AVAILABLE'}]}));
  const demand=Object.fromEntries(Array.from({length:8},(_,i)=>['s'+i,12+(seed*i)%15]));
  let calls=0;const decide=(b,d)=>{calls++;return wholeBoxDecision(b.balances,d,[],false)};
  process.env.WMS_FBO_PLAN_COALESCE_ENABLED='false';const old=prioritizeFboWholeBoxes(boxes,demand,cacheFboBoxDecision(decide));const oldCalls=calls;calls=0;
  process.env.WMS_FBO_PLAN_COALESCE_ENABLED='true';const now=prioritizeFboWholeBoxes(boxes,demand,cacheFboBoxDecision(decide));assert.deepEqual(now,old);assert.ok(calls<oldCalls/2);
 }
});
