// TEST: exact runtime methods with controlled WB responses and branch scope.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.env.FBS_RUNTIME || require('node:path').resolve(__dirname,'../../../docs/releases/fbs-active-bootstrap/source-reference.js'),'utf8');
function method(name,next,globals={}){const start=source.indexOf('    '+name);const end=source.indexOf('    '+next,start);a.ok(start>0&&end>start);return vm.runInNewContext('({'+source.slice(start,end)+'})',{...globals,process:{env:{}},Date,Map,Set,Promise});}
test('display loads active orders without waiting for history and keeps route filter',async()=>{
 let options,scopeArgs;const fresh={orders:[{id:'new'}],fetchedAt:new Date().toISOString(),connections:[]};
 const self=method('async listFbsOrdersForDisplay(', 'async listFbsOrders(',{common_1:{BadRequestException:Error},FBS_ORDERS_CACHE_TTL_MS:60000,wildberries_request_scheduler_1:{runWithWildberriesRequestPriority:(_,fn)=>fn()}});
 const entries=new Map();Object.assign(self,{clientScopes:{requireClientAccess:()=>{}},fbsOrdersCache:new Map(),fbsDisplayCache:{get:k=>entries.get(k),refresh:(k,load)=>{entries.set(k,{pending:true});self.pending=load().then(value=>entries.set(k,{value,pending:false}))}},loadFbsOrders:async(id,prev,opts)=>{options=opts;return opts.historyMode==='active-only'?fresh:new Promise(()=>{})},loadFbsTsdRequestOrders:async()=>({orders:[],connections:[]}),mergeSyncedFbsTsdRequestOrders:async(_,v)=>v,scopeFbsOrdersForUser:async(...args)=>{scopeArgs=args;return args[0]}});
 await self.listFbsOrdersForDisplay('client',{},false,false,'moscow');a.equal(options.historyMode,'active-only');a.equal(options.billingMode,'skip');a.equal(options.readOnly,true);await self.pending;
 const result=await self.listFbsOrdersForDisplay('client',{},false,false,'moscow');a.equal(result.orders[0].id,'new');a.equal(scopeArgs[3],'moscow');a.equal(result.sync.partial,false);
});
test('active WB fetch skips history even with a warm historical cache and preserves names',async()=>{
 let historyCalls=0,statusIds=[],historyWrites=0;
 const self=method('async fetchWildberriesFbsOrders(', 'async fetchOzonFbsOrders(',{
 marketplaceJson:async(url,init)=>url.endsWith('/orders/new')?{orders:[{id:1,warehouseId:77}]}:url.endsWith('/orders/status')?(statusIds.push(...JSON.parse(init.body).orders),{orders:[{id:1,supplierStatus:'new',wbStatus:'waiting'}]}):{orders:[]},
 fetchWildberriesFbsHistory:async()=>{historyCalls++;throw Error('history must not block')},asArray:x=>Array.isArray(x)?x:[],compactWildberriesFbsOrder:x=>x,textValue:x=>x==null?'':String(x),uniqueStrings:x=>[...new Set(x)],chunks:(x,n)=>[x],fbsOrderCategory:()=> 'active',client_1:{MarketplaceType:{WILDBERRIES:'WILDBERRIES'}}});
 Object.assign(self,{wildberriesFbsHistoryCache:{get:()=>({expiresAt:Date.now()+60000,orders:[{id:999,warehouseId:77}]}),set:()=>historyWrites++},wildberriesFbsStatusCache:new Map(),wildberriesFbsStatusCacheTtlMs:60000,fetchWildberriesStockWarehouses:async()=>[{id:'77',name:'Мой склад FBS Москва'}]});
 const orders=await self.fetchWildberriesFbsOrders({id:'c',apiKey:'test'},'active-only');a.equal(historyCalls,0);a.equal(historyWrites,0);a.deepEqual(statusIds,[1]);a.equal(orders.length,1);a.equal(orders[0].warehouseName,'Мой склад FBS Москва');
});

test('historical shipment without snapshot identity keeps durable order and connection',async()=>{
 const self=method('async applyLocalWbShipments(', 'async webOrderAssemblyHistory(',{selectionKey:(c,id)=>c+':'+id,client_1:{MarketplaceType:{WILDBERRIES:'WILDBERRIES'}}});
 const fact={assemblyId:'a',connectionId:'cabinet',orderId:'123',orderSnapshot:{article:'shirt'},shippedAt:new Date()};
 Object.assign(self,{prisma:{wbOrderShipment:{findMany:async args=>args.select.orderSnapshot?[fact]:[{assemblyId:'a'}]},fbsTsdAssembly:{findMany:async()=>[]}}});
 const rows=await self.applyLocalWbShipments('client',[],true);a.equal(rows[0].id,'123');a.equal(rows[0].connectionId,'cabinet');a.equal(rows[0].marketplace,'WILDBERRIES');
});

