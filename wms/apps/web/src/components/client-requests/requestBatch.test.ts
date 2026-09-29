import {describe,it,expect} from 'vitest';
import {batchDonePayload, canBatchComplete, compareRequestStatus, missingSourceOnly, runRequestBatch} from './requestBatch';
// TEST: never erase a known box, even if its balance is zero or insufficient.
describe('request batch safety',()=>{
 it('selects noBox only without any known source',()=>{
  const items=[{requestItemId:'missing',requestedQuantity:2,boxes:[],fbsOrders:[]},{requestItemId:'emptyBox',requestedQuantity:2,boxes:[{availableQuantity:0}],fbsOrders:[]},{requestItemId:'fbs',requestedQuantity:2,boxes:[],fbsOrders:[{boxCode:'BOX1'}]}];
  expect(missingSourceOnly(items as any)).toEqual([{requestItemId:'missing',quantity:2,noBox:true}]);
 });
 it('orders stages and excludes finished/cancelled/rejected',()=>{
  expect(compareRequestStatus({status:'IN_WORK',number:10} as any,{status:'PACKED',number:1} as any)).toBeLessThan(0);
  for(const status of ['DONE','CANCELLED','REJECTED'])expect(canBatchComplete({status} as any)).toBe(false);
 });
 it('retains independent successes when one request fails',async()=>{
  const calls:string[]=[];const result=await runRequestBatch([{id:'1'},{id:'2'},{id:'3'}],async x=>{calls.push(x.id);if(x.id==='2')throw Error('КИЗ не подтверждён');});
  expect(calls).toEqual(['1','2','3']);expect(result.map(x=>x.ok)).toEqual([true,false,true]);expect(result[1].error).toContain('КИЗ');
 });
 // TEST: do not replace recorded pallet/box counts and packed quantities with bulk defaults.
 it('preserves recorded packaging and enforces normal weight checks',()=>{
  const request={type:'OUTBOUND',status:'PACKED',items:[{quantity:20}],packages:[{packageType:'PALLET',items:[{quantity:5}]},{packageType:'BOX',items:[{quantity:3}]}]};
  expect(batchDonePayload(request as any,9,{items:[]} as any)).toMatchObject({boxes:1,pallets:1,packedUnits:8,allowOverweightPackages:false});
  expect(batchDonePayload({...request,status:'IN_WORK',packages:[]} as any,2,{items:[]} as any)).toMatchObject({boxes:2,pallets:0,packedUnits:20});
 });
});
