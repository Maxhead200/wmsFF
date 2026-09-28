const {test}=require('node:test'),assert=require('node:assert/strict');
const root=process.env.KIZ_CANDIDATE||'/app/apps/api/dist';
const {releaseCancelledBindings}=require(root+'/common/kiz-cancelled-reuse');
function fixture(){
 process.env.WMS_KIZ_CANCELLED_ADMIN_REUSE_ENABLED='true';process.env.WMS_KIZ_SORTING_ADMIN_REUSE_ENABLED='true';
 const identity='0104680992599964215vG!uiDObuiDU',calls=[];
 const old={id:'old',clientId:'c',requestId:'r',orderId:'o',status:'COMPLETED',completedAt:new Date('2026-09-14'),updatedAt:new Date(),kiz:identity};
 const evidence={checkedAt:new Date().toISOString(),decision:'REVIEW',circulation:null,orders:[{orderId:'o',verified:true,supplierStatus:'complete',wbStatus:'sorted'}]};
 const tx={$queryRaw:async()=>[],fbsTsdAssembly:{findMany:async()=>[old],updateMany:async x=>{calls.push(x);return {count:1}}},clientRequest:{findMany:async()=>[{id:'r'}]},
 shippedKizHistory:{findMany:async()=>[{assemblyId:'old',kiz:identity,shippedAt:new Date('2026-09-14')}]},productMark:{findMany:async()=>[{id:'m',value:identity,skuId:'sku',boxId:'box',status:'AVAILABLE'}]},
 auditLog:{findFirst:async q=>{assert.equal(q.where.createdAt.gt.toISOString(),'2026-09-14T00:00:00.000Z');return {id:'audit',userId:'admin',createdAt:new Date('2026-09-28'),payload:{physicalTruth:true,quantity:1,targetClientId:'c',targetWarehouseId:'w',skuId:'sku',movementId:'move'}}},create:async x=>calls.push(x)},stockMovement:{findFirst:async()=>({id:'move'})}};
 return {old,evidence,tx,calls,run:()=>releaseCancelledBindings(tx,'c',identity,evidence,'admin','review')};
}
test('compiled runtime archives a historical binding with exact sorting evidence',async()=>{const f=fixture();await f.run();assert.equal(f.calls[0].data.action,'KIZ_SORTING_BINDING_ARCHIVED');assert.equal(f.calls[0].data.payload.sortingProof.auditId,'audit');assert.equal(f.calls[1].data.kiz,null)});
for(const kind of ['disabled','active','missingAudit','missingMovement','duplicate','sold','retired','unverified','stale','history'])test('compiled runtime rejects '+kind,async()=>{const f=fixture();
 if(kind==='disabled')process.env.WMS_KIZ_SORTING_ADMIN_REUSE_ENABLED='false';
 if(kind==='active')f.old.status='IN_PROGRESS';
 if(kind==='missingAudit')f.tx.auditLog.findFirst=async()=>null;
 if(kind==='missingMovement')f.tx.stockMovement.findFirst=async()=>null;
 if(kind==='duplicate')f.tx.productMark.findMany=async()=>[{value:f.old.kiz},{value:f.old.kiz}];
 if(kind==='sold')f.evidence.orders[0].wbStatus='sold';
 if(kind==='retired')f.evidence.circulation='RETIRED';
 if(kind==='unverified')f.evidence.orders[0].verified=false;
 if(kind==='stale')f.evidence.checkedAt=new Date(Date.now()-61000).toISOString();
 if(kind==='history')f.tx.shippedKizHistory.findMany=async()=>[];
 await assert.rejects(f.run());assert.equal(f.calls.length,0);
});
test('cancelled order path remains available without sorting flag',async()=>{const f=fixture();process.env.WMS_KIZ_SORTING_ADMIN_REUSE_ENABLED='false';f.evidence.orders[0].supplierStatus='cancel';f.evidence.orders[0].wbStatus='canceled';await f.run();assert.equal(f.calls[0].data.action,'KIZ_CANCELLED_BINDING_ARCHIVED')});
