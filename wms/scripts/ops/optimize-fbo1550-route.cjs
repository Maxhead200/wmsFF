const {PrismaClient}=require('/app/apps/api/node_modules/@prisma/client');const p=new PrismaClient();const dist='/app/apps/api/dist/';
(async()=>{const {AuthService}=require(dist+'modules/auth/auth.service');const {WarehouseAuthScopeService}=require(dist+'modules/auth/warehouse-auth-scope.service');const {SystemSettingsService}=require(dist+'common/settings/system-settings.service');const {ClientScopeService}=require(dist+'modules/auth/client-scope.service');const {FboTwoStageService}=require(dist+'modules/tsd/fbo-two-stage.service');
const auth=new AuthService(p,null,null,null,null,null,new SystemSettingsService(p),null,new WarehouseAuthScopeService(p));const record=await p.user.findUnique({where:{id:'b045e060-dfd7-48af-bb88-12c191ee8eae'},include:auth.userAccessInclude()});if(record?.status!=='ACTIVE'||record.name!=='La_panthera')throw Error('Actor');const user=await auth.toAuthUser(record);const id='1c6568d2-5de8-4d66-8713-487157aeed7f';
// FIX: this operation changes only request 1550's routing preference, under its normal scan lock.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');const svc=new FboTwoStageService(p,new ClientScopeService());const key='fbo.route.'+id;
if(!user.permissionCodes.includes('system:admin'))throw Error('Administrator required');
const summary=plan=>({picked:plan.picked,packed:plan.packed,remaining:plan.lines.reduce((s,l)=>s+l.remaining,0),boxes:plan.route.length,whole:plan.route.filter(b=>b.wholeBox).length,wholeQty:plan.route.filter(b=>b.wholeBox).reduce((s,b)=>s+b.tasks.reduce((s,t)=>s+t.quantity,0),0),shortage:plan.shortage});
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const result=await p.$transaction(async tx=>{
 await tx.$queryRaw`SELECT "id" FROM "ClientRequest" WHERE "id"=${id} FOR UPDATE`;
 const request=await svc.load(tx,id,user,'write');svc.requireFbo(request);assert.equal(request.number,1550);assert.equal(request.clientId,'c76b78f9-1b83-4e9b-bee3-bc28336ee1c9');assert.equal(request.warehouseId,'afb244a1-50ae-4ae6-9111-afe85949fa58');assert.equal(request.items.reduce((s,i)=>s+i.quantity,0),1833);
 assert.equal(request.status,'IN_WORK');
 const beforePlan=await svc.snapshot(tx,request);assert.equal(beforePlan.phase,'PICKING');assert.equal(beforePlan.compositionChanged,false);
 const existing=await tx.systemSetting.findUnique({where:{key}});if(existing){
   const compositionHash=digest(request.items.map(i=>[i.id,i.skuId,i.barcode,i.quantity]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
   assert(await require(dist+'modules/tsd/fbo-request-route').loadFboRoutePreference(tx,request,compositionHash),'Existing preference is stale');
   return{alreadyApplied:true,current:summary(beforePlan)};
 }
 const beforeProgress=await tx.fboAssembly.findUniqueOrThrow({where:{requestId:id},include:{units:{orderBy:{id:'asc'}},boxes:{orderBy:{id:'asc'}}}});
 const receipts=await tx.stockMovement.findMany({where:{clientId:request.clientId,warehouseId:request.warehouseId,type:'RECEIPT',createdAt:{gte:new Date('2026-09-24')},box:{code:{startsWith:'FFL_LKB2409_'}}},select:{boxId:true},distinct:['boxId']});
 const value={version:1,id,clientId:request.clientId,warehouseId:request.warehouseId,compositionHash:digest(request.items.map(i=>[i.id,i.skuId,i.barcode,i.quantity]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))),preferredBoxIds:receipts.map(x=>x.boxId).filter(Boolean)};assert(value.preferredBoxIds.length);
 await tx.systemSetting.create({data:{key,value,updatedByUserId:user.id}});
 const afterPlan=await svc.snapshot(tx,request);const before=summary(beforePlan),after=summary(afterPlan);
 assert(after.boxes<=before.boxes,'Would increase route');assert(after.wholeQty>=before.wholeQty,'Would reduce whole-box quantity');assert.equal(after.shortage,before.shortage);assert.deepEqual(afterPlan.pickedUnits,beforePlan.pickedUnits);assert.deepEqual(afterPlan.boxes,beforePlan.boxes);assert.deepEqual(afterPlan.lines,beforePlan.lines);
 const afterProgress=await tx.fboAssembly.findUniqueOrThrow({where:{requestId:id},include:{units:{orderBy:{id:'asc'}},boxes:{orderBy:{id:'asc'}}}});assert.equal(digest(beforeProgress),digest(afterProgress));
 await tx.auditLog.create({data:{userId:user.id,action:'FBO_REMAINDER_ROUTE_OPTIMIZED',entity:'ClientRequest',entityId:id,payload:{settingKey:key,before,after,preferredReceipt:'FFL_LKB2409',progressPreserved:true,progressHash:digest(afterProgress)}}});
 return{applied:true,at:new Date(),number:1550,before,after,progressPreserved:true,settingKey:key};
},{isolationLevel:'ReadCommitted',timeout:30000});console.log(JSON.stringify(result));})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>p.$disconnect());
