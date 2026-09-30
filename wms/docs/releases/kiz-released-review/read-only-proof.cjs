// TEST: read-only real return proof and simulated conditional archival; no review is granted.
const {PrismaClient}=require('/app/apps/api/node_modules/@prisma/client');const p=new PrismaClient();
(async()=>{const result=await p.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
const old=await tx.fbsTsdAssembly.findUniqueOrThrow({where:{id:'548f3d1b-b78e-4a91-8e7c-c680fdbf6468'}});
const helper=require('/app/apps/api/dist/common/kiz-sorting-return-proof'),mod=require('/app/apps/api/dist/common/kiz-cancelled-reuse');
if(old.status!=='RELEASED'||!old.kiz)throw Error('Live example changed');
const proof=await helper.findSortingReturnProof(tx,old.clientId,helper.manualKizIdentity(old.kiz),[old]);if(!proof)throw Error('No return proof');
let updates=0;
const proxy=new Proxy(tx,{get(o,k){if(k==='auditLog')return {...o[k],create:async()=>({})};if(k==='fbsTsdAssembly')return {...o[k],updateMany:async arg=>{if(arg.where.status!=='RELEASED'||arg.where.id!==old.id||arg.data.kiz!==null)throw Error('Unexpected write');updates++;return{count:1}}};return o[k]}});
await mod.releaseCancelledBindings(proxy,old.clientId,old.kiz,{checkedAt:new Date().toISOString(),decision:'REVIEW',circulation:null,orders:[{orderId:old.orderId,verified:true,supplierStatus:'complete',wbStatus:'sorted'}]},'b045e060-dfd7-48af-bb88-12c191ee8eae','read-only-proof','',true);
if(updates!==1)throw Error('No simulated release');return{passed:true,realReturnProof:proof,simulatedWrites:updates,liveWrites:0};},{timeout:30000});console.log(JSON.stringify(result));})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>p.$disconnect());
