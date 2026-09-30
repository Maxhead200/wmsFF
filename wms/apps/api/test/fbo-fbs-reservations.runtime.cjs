// TEST: execute the exact published/candidate JavaScript with controlled stock fixtures.
// Usage: node --test <this file>; FBO_RUNTIME_UNDER_TEST points to the materialized service.
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {FboTwoStageService}=require(process.env.FBO_RUNTIME_UNDER_TEST);
const kiz='010468099259845521AAAAAAAAAAAA0\x1d91EE12\x1d92test';
function fixture(quantity=25,reserved=1){
 const r={id:'request',number:1,clientId:'client',warehouseId:'warehouse',status:'IN_WORK',items:[{id:'line',skuId:'sku',barcode:'barcode',quantity:25,sku:{name:'Suit',barcodes:[{value:'barcode'}]}}]};
 const source={id:'box',code:'FFL_box',clientId:r.clientId,warehouseId:r.warehouseId,status:'active'};
 const balance={boxId:'box',skuId:'sku',quantity,status:'AVAILABLE'};
 const task={id:'fbs',clientId:'client',requestId:'fbs-request',connectionId:'connection',orderId:'order',status:'RESERVED',skuId:'sku',sourceSkuId:null,relabelConfirmedAt:null,itemCount:reserved,boxId:null,reservedBoxId:'box'};
 let writes=0; const write=async()=>{writes++;throw Error('UNEXPECTED_WRITE');};
 const compositionHash=crypto.createHash('sha256').update(JSON.stringify(r.items.map(i=>[i.id,i.skuId,i.barcode,i.quantity]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))).digest('hex');
 const a={phase:'PICKING',compositionHash,units:[],boxes:[]};
 const tx={
  $queryRaw:async()=>[], $executeRaw:async()=>0,
  stockBalance:{findMany:async()=>[balance],findFirst:async()=>balance,updateMany:write,upsert:write},
  stockMovement:{findMany:async()=>[],create:write},
  clientRequest:{findMany:async()=>[{id:'fbs-request'}]},
  fbsOrderRequestLink:{findMany:async()=>[]},
  fbsTsdAssembly:{findMany:async()=>reserved?[task]:[],update:write,updateMany:write},
  fboAssembly:{findUnique:async()=>a,findUniqueOrThrow:async()=>a,update:write},
  fboAssemblyUnit:{findMany:async()=>[],findUnique:async()=>null,create:write,update:write},
  fboAssemblyAction:{findUnique:async()=>null,create:write},
  fboAssemblyBox:{findUnique:async()=>({requestId:r.id}),updateMany:write},
  box:{findUnique:async()=>source,findUniqueOrThrow:async()=>source,upsert:write,
    findMany:async()=>[{...source,balances:[balance],productMarks:[]}]},
  productMark:{findMany:async()=>[],update:write,updateMany:write,create:write},
  sku:{findUnique:async()=>({id:'sku',clientId:'client',barcodes:[{value:'barcode'}]})},
  inventoryAuditBox:{count:async()=>0},user:{findMany:async()=>[]},systemSetting:{findUnique:async()=>null},
 };
 const service=new FboTwoStageService({$transaction:async f=>f(tx)},null,null,null,{assertStockMovementsAllowed:async()=>{}});
 service.load=async()=>r;service.requireFbo=()=>{};service.box=async()=>source;service.requireIdleBox=async()=>{};service.busyBoxes=async()=>new Set();
 return {service,tx,r,source,task,balance,a,write,writes:()=>writes};
}
process.env.WMS_FBO_TWO_STAGE_ENABLED='true';
process.env.WMS_FBO_FAST_ACK_ENABLED='false';
process.env.WMS_FBO_PICK_BIND_KIZ='false';
// TEST: this fails on the published artifact (25 rather than 24).
test('route preserves one of 25 units for FBS',async()=>{
 const f=fixture();const plan=await f.service.snapshot(f.tx,f.r);
 assert.equal(plan.route[0].tasks[0].quantity,24);assert.equal(plan.shortage,1);assert.equal(plan.route[0].wholeBox,false);
});
test('without FBS reservations the full box remains available',async()=>{
 const f=fixture(25,0);const plan=await f.service.snapshot(f.tx,f.r);
 assert.equal(plan.route[0].tasks[0].quantity,25);assert.equal(plan.shortage,0);assert.equal(plan.route[0].wholeBox,true);
});
for(const action of ['PICK_BOX','PICK_UNIT'])test(action+' rejects consuming reserved stock before any write',async()=>{
 const f=fixture(action==='PICK_BOX'?25:1);
 await assert.rejects(f.service.act(f.r.id,{action,operationId:'operation',sourceBoxCode:'FFL_box',barcode:'barcode',confirmedQuantity:25},{id:'user'}),/зарезервирован/);
 assert.equal(f.writes(),0);
});
test('manual packaging cannot consume a reserved unit',async()=>{
 const f=fixture(1);f.service.manualPackingMark=async()=>({id:'mark',value:kiz,skuId:'sku',clientId:'client',boxId:'box',status:'AVAILABLE'});
 f.service.box=async(_tx,_r,code)=>code==='target'?{id:'target',code}:f.source;
 f.service.move=f.write;
 await assert.rejects(f.service.manualPack(f.tx,f.r,{kiz,barcode:'barcode',targetBoxCode:'target'},{id:'user'},'key'),/зарезервирован/);
 assert.equal(f.writes(),0);
});
test('manual packaging of an already picked FBO unit does not reserve it again',async()=>{
 const f=fixture(0);const mark={id:'mark',value:kiz,skuId:'sku',clientId:'client',boxId:'box',status:'PACKING'};
 f.service.manualPackingMark=async()=>mark;
 f.tx.fboAssemblyUnit.findUnique=async()=>({id:'unit',requestId:f.r.id,state:'PICKED',wholeBox:false});
 f.service.box=async()=>({id:'target',code:'target'});
 f.service.move=async()=>{throw Error('PACKING_TRANSFER_ALLOWED');};
 await assert.rejects(f.service.manualPack(f.tx,f.r,{kiz,barcode:'barcode',targetBoxCode:'target'},{id:'user'},'key'),/PACKING_TRANSFER_ALLOWED/);
 assert.equal(f.writes(),0);
});
test('physical KIZ recovery cannot release an active FBS assignment',async()=>{
 const f=fixture(1);f.task.kiz=kiz;
 f.tx.productMark.findMany=async()=>[{id:'mark',value:kiz,skuId:'sku',clientId:'client',boxId:'box',status:'AVAILABLE'}];
 await assert.rejects(f.service.bindPickedMark(f.tx,f.r,'sku','box',kiz,'key',{id:'user'}),/активной сборкой FBS/);
 assert.equal(f.writes(),0);
});
test('recovery from a different box protects its quantity reservation',async()=>{
 const f=fixture(1);f.tx.productMark.findMany=async()=>[{id:'mark',value:kiz,skuId:'sku',clientId:'client',boxId:'box',status:'AVAILABLE'}];
 f.tx.fbsTsdAssembly.findMany=async args=>args.where.AND?[f.task]:[];
 f.tx.stockBalance.findFirst=async args=>args.where.boxId==='box'?f.balance:null;
 await assert.rejects(f.service.bindPickedMark(f.tx,f.r,'sku','other-box',kiz,'key',{id:'user'}),/зарезервирован/);
 assert.equal(f.writes(),0);
});
