// TEST: ordinary picking closes only complete, unmarked, non-SOS requests.
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const {ship}=vi.hoisted(()=>({ship:vi.fn(async (_tx:any,id:string)=>({assemblyId:id,quantity:1}))}));
vi.mock('../src/common/stock/wb-order-stock-lifecycle',()=>({wbOrderStockLifecycleEnabled:()=>true,finalizeWbOrderShipment:ship}));
import {reconcileFbsRequestStatus} from '../src/common/stock/fbs-request-auto-status';
const now=new Date('2026-09-29T10:00:00Z');
function fixture(){
 const tasks=[1,2].map(n=>({id:`t${n}`,marketplace:'WILDBERRIES',connectionId:'c',orderId:`o${n}`,requestItemId:`i${n}`,skuId:`s${n}`,status:'COMPLETED',itemCount:1,startedAt:now,completedAt:now,workerUserId:'u',deviceCode:'TSD:one',requiresKiz:false,kiz:null,barcode:'123',sourceBoxPending:false}));
 const request={id:'r',number:1,title:'FBS',clientId:'c',type:'OUTBOUND',status:'IN_WORK',items:tasks.map(t=>({id:t.requestItemId,skuId:t.skuId,quantity:1})),fbsOrderLinks:tasks.map(t=>({...t,syncStatus:'ACTIVE'}))};
 const tx:any={$queryRaw:vi.fn(),clientRequest:{findUnique:vi.fn(async()=>request),update:vi.fn(async({data}:any)=>{request.status=data.status;return request;})},clientRequestEvent:{findFirst:vi.fn(async()=>null),create:vi.fn()},fbsTsdAssembly:{findMany:vi.fn(async()=>tasks)},fbsPrintJob:{findMany:vi.fn(async()=>[])},wbOrderShipment:{findMany:vi.fn(async()=>[])}};
 return {tx,tasks,request};
}
beforeEach(()=>{vi.stubEnv('WMS_FBS_REQUEST_AUTO_STATUS_ENABLED','true');vi.stubEnv('WMS_FBS_UNMARKED_PICK_CLOSE_ENABLED','true');ship.mockClear();});
afterEach(()=>vi.unstubAllEnvs());
describe('ordinary unmarked pick',()=>{
 it('ships once and closes after the last confirmed unit; replay does nothing',async()=>{const {tx}=fixture();expect(await reconcileFbsRequestStatus(tx,'r',{stage:'PICK',occurredAt:now})).toBe('DONE');expect(ship).toHaveBeenCalledTimes(2);await reconcileFbsRequestStatus(tx,'r',{stage:'PICK',occurredAt:now});expect(ship).toHaveBeenCalledTimes(2);});
 it.each(['marked','sos','partial','sourcePending','removed','print'])('does not close %s requests',async(kind)=>{const {tx,tasks,request}=fixture();if(kind==='marked')tasks[0].requiresKiz=true;if(kind==='sos')tasks[0].deviceCode='SOS-WB:one';if(kind==='partial')tasks[0].status='IN_PROGRESS';if(kind==='sourcePending')tasks[0].sourceBoxPending=true;if(kind==='removed')request.fbsOrderLinks[0].syncStatus='REMOVED';if(kind==='print')tx.fbsPrintJob.findMany.mockResolvedValue([{assemblyId:'t1'}]);expect(await reconcileFbsRequestStatus(tx,'r',{stage:'PICK',occurredAt:now})).not.toBe('DONE');expect(ship).not.toHaveBeenCalled();});
 it('preserves sold-WMS behavior without the flag',async()=>{vi.stubEnv('WMS_FBS_UNMARKED_PICK_CLOSE_ENABLED','false');const {tx}=fixture();expect(await reconcileFbsRequestStatus(tx,'r',{stage:'PICK',occurredAt:now})).toBe('PACKED');expect(ship).not.toHaveBeenCalled();});
 it('propagates shipment failure without writing DONE or an event',async()=>{ship.mockRejectedValueOnce(new Error('insufficient stock'));const {tx}=fixture();await expect(reconcileFbsRequestStatus(tx,'r',{stage:'PICK',occurredAt:now})).rejects.toThrow('insufficient stock');expect(tx.clientRequest.update).not.toHaveBeenCalled();expect(tx.clientRequestEvent.create).not.toHaveBeenCalled();});
});

import {ordinaryPickStatusLabel} from '../src/common/stock/ordinary-unmarked-pick';
// TEST: barcode acceptance is found; physical button completion is packed.
it('uses contextual labels only for ordinary confirmed barcodes',()=>{const {tasks}=fixture();const t=tasks[0];expect(ordinaryPickStatusLabel({...t,status:'IN_PROGRESS'},'В работе')).toBe('Найдено');expect(ordinaryPickStatusLabel(t,'Собрано')).toBe('Упаковано');expect(ordinaryPickStatusLabel({...t,barcode:null},'В работе')).toBe('В работе');expect(ordinaryPickStatusLabel({...t,requiresKiz:true},'Собрано')).toBe('Собрано');});
