// TEST: recovery executes mutations without computing an unused warehouse route.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {FboTwoStageService:F}=require('/app/apps/api/dist/modules/tsd/fbo-two-stage.service.js');
for(const action of ['CLOSE_PICK','PACK_UNITS'])test(action+' does not calculate route',async()=>{
 const load=F.prototype.load,execute=F.prototype.executeAction,plan=F.prototype.plan;const calls=[];
 F.prototype.load=async()=>({id:'r',status:'IN_WORK'});
 F.prototype.executeAction=async(id,dto)=>{calls.push(dto)};
 F.prototype.plan=async()=>{throw Error('unused warehouse route inside write transaction')};
 const tx={fboAssembly:{findUniqueOrThrow:async()=>({phase:action==='CLOSE_PICK'?'PICKING':'PACKING'})},fboAssemblyUnit:{findMany:async()=>[{id:'u',state:'PICKED',kiz:'mark',barcode:'barcode'}]},fboAssemblyBox:{findUnique:async()=>({id:'b',boxId:'b',boxCode:'target',closedAt:new Date()}),update:async()=>{}}};
 const f=new F({}, {}, {}, {}, {assertStockMovementsAllowed:async()=>{}});f.requireFbo=()=>{};f.requireIdleBox=async()=>{};f.validatePackedBox=async()=>{};
 try{await f.recoverInTransaction(tx,'r',{action,unitIds:['u'],targetBoxCode:'target'},{id:'admin'},'key');assert.deepEqual(calls.map(x=>x.action),action==='CLOSE_PICK'?['STOP_PICK']:['PACK_UNIT','CLOSE_BOX']);assert.deepEqual(calls.map(x=>x.operationId),calls.map((_,i)=>'key:'+i));}
 finally{F.prototype.load=load;F.prototype.executeAction=execute;F.prototype.plan=plan;}
});
test('ordinary act still returns the terminal route',async()=>{const f=new F({});const calls=[];f.executeAction=async()=>calls.push('execute');f.plan=async()=>{calls.push('plan');return{route:['box']}};assert.deepEqual(await f.act('r',{},{}),{route:['box']});assert.deepEqual(calls,['execute','plan']);});
// TEST: an exhausted serialization conflict is a recoverable HTTP409, not HTTP500.
test('administrative conflicts retry fresh transactions and explain exhaustion',async()=>{
 const {Prisma}=require('/app/apps/api/node_modules/@prisma/client');
 const {FboProblemsService:P}=require('/app/apps/api/dist/modules/administration/fbo-problems.service');
 const error=new Prisma.PrismaClientKnownRequestError('write conflict',{code:'P2034',clientVersion:'test'});let attempts=0;
 const svc=new P({$transaction:async()=>{attempts++;throw error}});
 await assert.rejects(svc.apply('r','token',{}),e=>e.getStatus?.()===409&&e.message.includes('Повторите'));
 assert.equal(attempts,3);
});
