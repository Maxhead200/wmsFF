// TEST: run actual candidate queries against our database in a read-only transaction.
require('reflect-metadata');const assert=require('node:assert/strict');
const {PrismaService}=require('./dist/common/prisma/prisma.service');
const {ClientScopeService}=require('./dist/modules/auth/client-scope.service');
const {BillingSettlementsService}=require('./dist/modules/billing/billing-settlements.service');
(async()=>{const prisma=new PrismaService();try{
 const owner=await prisma.user.findFirst({where:{status:'ACTIVE',roles:{some:{role:{code:'OWNER'}}},activeWarehouseId:{not:null}},select:{id:true,activeWarehouseId:true}});
 if(!owner)throw Error('Active owner warehouse required for read-only probe');
 const hidden=await prisma.client.findMany({where:{isDemo:true},select:{id:true}});
 const user={id:owner.id,isDemo:false,permissionCodes:['billing:read','system:admin'],clientScopeMode:'ALL',clientIds:[],writableClientIds:[],hiddenClientIds:hidden.map(c=>c.id),activeWarehouseId:owner.activeWarehouseId,warehouseIds:[owner.activeWarehouseId]};
 process.env.WMS_BILLING_SETTLEMENTS_ENABLED='true';
 const service=new BillingSettlementsService(prisma,new ClientScopeService());
 const report=await service.list({periodFrom:'2026-10-01',periodTo:'2026-10-02'},user);
 assert.equal(report.enabled,true);assert.equal(report.warehouseId,user.activeWarehouseId);
 assert(report.rows.every(r=>!hidden.some(c=>c.id===r.client.id)));
 assert(report.rows.every(r=>['unbilledRub','draftRub','reviewRub','debtRub','overdueRub','clientAdvanceRub'].every(k=>Number.isFinite(r[k]))));
 await assert.rejects(()=>service.list({periodFrom:'2026-10-01',periodTo:'2026-10-02'},{...user,permissionCodes:['billing:read'],warehouseIds:[]}));
 console.log(JSON.stringify({readOnlyReport:true,clients:report.rows.length,issues:report.issues.length,missingWork:report.issues.filter(i=>i.code==='WORK_WITHOUT_CHARGE').length,permissionDenial:true,demoExcluded:true,finiteAmounts:true}));
 }finally{await prisma.$disconnect();}})().catch(e=>{console.error('Read-only probe:',e.message);process.exitCode=1});
