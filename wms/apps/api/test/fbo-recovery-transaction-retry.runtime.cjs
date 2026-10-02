// TEST: the actual production module must propagate conflicts to its transaction owner.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('/app/apps/api/node_modules/@prisma/client');
const { FboTwoStageService } = require('/app/apps/api/dist/modules/tsd/fbo-two-stage.service.js');
const conflict = () => new Prisma.PrismaClientKnownRequestError('serialization conflict', {code:'P2034',clientVersion:'test'});
process.env.WMS_FBO_TWO_STAGE_ENABLED='true';
process.env.WMS_FBO_CLOSE_PICK_ENABLED='true';
const lock={assertStockMovementsAllowed:async()=>{}};

for (const action of ['CLOSE_PICK', 'PACK_UNITS']) {
test(`${action} propagates original conflict without querying an aborted transaction`, async()=>{
 const originalLoad=FboTwoStageService.prototype.load;
 FboTwoStageService.prototype.load=async()=>({id:'r',status:'IN_WORK'});
 let queries=0;const first=conflict();
 const tx={
  $queryRaw:async()=>{if(++queries===1)throw first;throw Error('25P02: transaction aborted')},
  fboAssembly:{findUniqueOrThrow:async()=>({phase:action==='CLOSE_PICK'?'PICKING':'PACKING'})},
  fboAssemblyUnit:{findMany:async()=>[{id:'u',state:'PICKED',kiz:'physical-kiz',barcode:'barcode'}]},
  fboAssemblyBox:{findUnique:async()=>({id:'parcel',boxId:'box',boxCode:'target',wholeBox:false}),update:async()=>{}}
 };
 const svc=new FboTwoStageService({}, {}, {}, {}, lock);
 svc.requireFbo=()=>{};svc.requireIdleBox=async()=>{};
 try {
  await assert.rejects(svc.recoverInTransaction(tx,'r',{action,unitIds:['u'],targetBoxCode:'target'},{id:'admin'},'receipt'),error=>error===first);
  assert.equal(queries,1);
 } finally {FboTwoStageService.prototype.load=originalLoad;}
});
}

test('ordinary actions keep three separate transaction attempts',async()=>{
 let attempts=0;const error=conflict();
 const svc=new FboTwoStageService({$transaction:async fn=>{attempts++;return fn({$queryRaw:async()=>{throw error}})}},{},{},{},lock);
 await assert.rejects(svc.executeAction('r',{action:'START',operationId:'same'},{id:'a'}),e=>e===error);
 assert.equal(attempts,3);
});

test('ordinary non-serialization errors are never retried',async()=>{
 let attempts=0;const error=Error('validation failed');
 const svc=new FboTwoStageService({$transaction:async()=>{attempts++;throw error}},{},{},{},lock);
 await assert.rejects(svc.executeAction('r',{action:'START',operationId:'same'},{id:'a'}),e=>e===error);
 assert.equal(attempts,1);
});
// TEST: real outer recovery retries the entire transaction with unchanged preview and receipt.
test('administrative apply retries in fresh transactions and records one receipt',async()=>{
 const {createHash}=require('node:crypto');
 const {FboProblemsService}=require('/app/apps/api/dist/modules/administration/fbo-problems.service.js');
 const state={request:{clientId:'c'},assembly:{phase:'PACKING',boxes:[],units:[]},balances:[],marks:[]};
 const preview={action:'FBO_RECOVERY_PREVIEW',entityId:'r',userId:'admin',createdAt:new Date(),payload:{input:{action:'PACK_UNITS',reason:'physical confirmation'},revision:createHash('sha256').update(JSON.stringify(state)).digest('hex')}};
 let attempts=0,commits=0;const seen=[],receipts=[];
 const db={$transaction:async fn=>{
  const number=++attempts;const staged=[];
  const tx={$queryRaw:async()=>[],auditLog:{findUnique:async q=>q.where.id==='token'?preview:null,create:async q=>staged.push(q.data)},clientRequestEvent:{create:async()=>{}}};
  const result=await fn(tx);receipts.push(...staged);commits++;return result;
 }};
 const fbo={recoverInTransaction:async(tx,id,input,user,token)=>{seen.push({tx,id,input,token});if(attempts===1)throw conflict();}};
 const svc=new FboProblemsService(db,fbo,{},lock,{});svc.access=async()=>{};svc.state=async()=>state;
 const result=await svc.apply('r','token',{id:'admin'});
 assert.equal(result.applied,true);assert.equal(attempts,2);assert.equal(commits,1);
 assert.notEqual(seen[0].tx,seen[1].tx);assert.equal(seen[0].token,seen[1].token);
 assert.deepEqual(seen[0].input,seen[1].input);assert.equal(receipts.length,1);assert.equal(receipts[0].id,'fbo-recovery:token');
});
