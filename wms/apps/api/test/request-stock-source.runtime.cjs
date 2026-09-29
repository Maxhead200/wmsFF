// TEST: exercise the packaged allocation planner without database/network writes.
const assert=require('node:assert/strict');
const root=process.argv[2]||'/app/apps/api/dist';
const {StockOperationsService}=require(root+'/modules/stock/stock-operations.service');
const service=new StockOperationsService({}, {}, {balanceKey:()=> 'test-key'});
function fixture(quantity,incomplete=false){let writes=0;const tx={fbsAssemblyAttemptHistory:{findMany:async()=>[]},fbsReshipmentRun:{findMany:async()=>[]},
 sku:{findFirst:async()=>({id:'sku',internalSku:'SKU',weightGrams:100})},
 box:{findMany:async()=>[{id:'box',code:'BOX',warehouseId:'warehouse',palletId:null}]},
 stockBalance:{findMany:async()=>[{id:'balance',clientId:'client',skuId:'sku',boxId:'box',palletId:null,warehouseId:'warehouse',status:'AVAILABLE',quantity,box:{code:'BOX',warehouseId:'warehouse'}}],upsert:async()=>{writes++;return{id:'new',quantity:1,warehouseId:'warehouse'}}},
 stockMovement:{create:async()=>{writes++;return{id:'movement'}}},
 fbsOrderRequestLink:{findMany:async()=>incomplete?[{connectionId:'c',orderId:'o',lastSkuId:'sku'}]:[]},
 fbsTsdAssembly:{findMany:async()=>[]}
 };return{tx,writes:()=>writes};}
async function run(f){return service.planRequestAllocationsWithPhysicalSources(f.tx,{id:'request',clientId:'client',items:[{id:'item',skuId:'sku',barcode:null,quantity:2}]},[],[{requestItemId:'item',boxCode:'BOX',quantity:2,requireAvailableStock:true}],'test','warehouse');}
(async()=>{
 const short=fixture(1);await assert.rejects(()=>run(short),/Недостаточно остатка/);assert.equal(short.writes(),0);
 const pending=fixture(2,true);await assert.rejects(()=>run(pending),/не завершены FBS/);assert.equal(pending.writes(),0);
 const enough=fixture(2);const plan=await run(enough);assert.equal(plan.lines[0].allocations[0].quantity,2);assert.equal(enough.writes(),0);
 const {ClientRequestPhysicalStockSourceDto}=require(root+'/modules/client-requests/dto/update-client-request-status.dto');
 const {validateSync}=require('/app/apps/api/node_modules/class-validator');
 const value=Object.assign(new ClientRequestPhysicalStockSourceDto(),{requestItemId:'item',boxCode:'BOX',quantity:2,requireAvailableStock:true});
 assert.deepEqual(validateSync(value,{whitelist:true}),[]);assert.equal(value.requireAvailableStock,true);
 value.requireAvailableStock='yes';assert(validateSync(value).some(e=>e.property==='requireAvailableStock'));
 console.log('PASS: strict availability, incomplete assembly, sufficient stock and DTO validation');
})().catch(e=>{console.error(e);process.exitCode=1});
