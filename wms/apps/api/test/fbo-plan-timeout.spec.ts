import { afterEach, expect, it, vi } from 'vitest';
import { FboTwoStageService } from '../src/modules/tsd/fbo-two-stage.service';
import { loadFboFbsAvailability } from '../src/modules/tsd/fbo-fbs-reservations';
afterEach(()=>vi.unstubAllEnvs());
function setup() {
 vi.stubEnv('WMS_FBO_TWO_STAGE_ENABLED','true');vi.stubEnv('WMS_FBO_PLAN_COALESCE_ENABLED','true');
 const svc:any=new FboTwoStageService({$transaction:async(fn:any)=>fn({})} as never,null as never,null as never,null as never,null as never,null as never);
 svc.load=vi.fn(async(_db:any,id:string,u:any)=>{if(u.denied)throw Error('denied');return {id};});svc.requireFbo=vi.fn();
 svc.snapshot=vi.fn(async()=>{await new Promise(r=>setTimeout(r,15));return {route:['box']};});return svc;
}
// TEST: simultaneous terminal opens share computation, never access checks or a settled result.
it('coalesces across users and recalculates after completion',async()=>{const s=setup();const results=await Promise.all([s.plan('r',{id:'a'}),s.plan('r',{id:'b'})]);expect(s.snapshot).toHaveBeenCalledTimes(1);expect(results[0]).toEqual(results[1]);expect(s.load.mock.calls.some((c:any)=>c[2].id==='b')).toBe(true);await s.plan('r',{id:'a'});expect(s.snapshot).toHaveBeenCalledTimes(2);});
it('checks denied callers independently',async()=>{const s=setup();const ok=s.plan('r',{id:'a'});await expect(s.plan('r',{id:'b',denied:true})).rejects.toThrow('denied');await ok;expect(s.snapshot).toHaveBeenCalledTimes(1);});
it('clears a rejected calculation',async()=>{const s=setup();s.snapshot.mockRejectedValueOnce(Error('timeout'));await expect(s.plan('r',{})).rejects.toThrow('timeout');await expect(s.plan('r',{})).resolves.toEqual({route:['box']});});
it('keeps other requests and disabled installations independent',async()=>{const s=setup();await Promise.all([s.plan('a',{}),s.plan('b',{})]);expect(s.snapshot).toHaveBeenCalledTimes(2);vi.stubEnv('WMS_FBO_PLAN_COALESCE_ENABLED','false');await Promise.all([s.plan('a',{}),s.plan('a',{})]);expect(s.snapshot).toHaveBeenCalledTimes(4);});
// TEST: a completed link for another cabinet/order must neither be loaded nor change reserves.
it.each(['true','false'])('narrows relevant shipped links with rollout %s',async flag=>{
 vi.stubEnv('WMS_FBO_PLAN_COALESCE_ENABLED',flag);
 const task={id:'t',requestId:'r',connectionId:'c1',orderId:'o1',marketplace:'WILDBERRIES',status:'RESERVED',skuId:'s',itemCount:1,boxId:'b'};
 const links=vi.fn(async()=>[]);const tx:any={stockBalance:{findMany:async()=>[{boxId:'b',skuId:'s',quantity:5}]},clientRequest:{findMany:async()=>[{id:'r'}]},fbsTsdAssembly:{findMany:async()=>[task]},stockMovement:{findMany:async()=>[]},fbsOrderRequestLink:{findMany:links},systemSetting:{findMany:async()=>[]}};
 const a=await loadFboFbsAvailability(tx,{clientId:'client',warehouseId:'w'},['s']);expect(a.free('b','s')).toBe(4);
 const where=links.mock.calls[0][0].where;
 if(flag==='true'){expect(where.connectionId).toEqual({in:['c1']});expect(where.orderId).toEqual({in:['o1']});}else expect(where.connectionId).toBeUndefined();
});
