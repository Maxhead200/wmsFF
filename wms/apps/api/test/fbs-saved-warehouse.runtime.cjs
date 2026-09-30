// TEST: saved requests keep marketplace warehouse identity without a WB call.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(process.env.FBS_RUNTIME||path.resolve(__dirname,'../../../docs/releases/fbs-active-bootstrap/saved-names-reference.js'),'utf8');
test('fallback FBS rows retain the saved warehouse id and name',async()=>{
const start=source.indexOf('    async loadFbsTsdRequestOrders('),end=source.indexOf('    async mergeSyncedFbsTsdRequestOrders(',start);a.ok(start>=0&&end>start);
const self=vm.runInNewContext('({'+source.slice(start,end)+'})',{uniqueStrings:xs=>[...new Set(xs)],client_1:{MarketplaceType:{WILDBERRIES:'WILDBERRIES',OZON:'OZON',YANDEX_MARKET:'YANDEX_MARKET'},ClientRequestStatus:{DONE:'DONE',CANCELLED:'CANCELLED',REJECTED:'REJECTED'}},FBS_REQUEST_LINK_ACTIVE:'ACTIVE',fbs_terminal_queue_1:{isFbsTerminalQueueOrder:()=>false},fbsStatusLabel:()=> 'На сборке',Map,Date});
Object.assign(self,{loadFbsDeliveryPlan:async()=>null,prisma:{client:{findUnique:async()=>({id:'c'})},clientMarketplaceConnection:{findMany:async()=>[{id:'conn'}]},fbsOrderRequestLink:{findMany:async()=>[{orderId:'1',connectionId:'conn',lastSkuId:'sku',createdAt:new Date(),lastSupplierStatus:'confirm',sellerWarehouseId:'1693195',sellerWarehouseName:'Мой склад FBS Москва',request:{number:1551}}]},sku:{findMany:async()=>[{id:'sku',barcodes:[],balances:[]}]}}});
const r=await self.loadFbsTsdRequestOrders('c',undefined,undefined,true);a.equal(r.orders[0].warehouseId,'1693195');a.equal(r.orders[0].warehouseName,'Мой склад FBS Москва');
});
