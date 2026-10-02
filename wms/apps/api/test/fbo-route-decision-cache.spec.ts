import { afterEach, expect, it, vi } from 'vitest';
import { cacheFboBoxDecision } from '../src/modules/tsd/fbo-request-route';
afterEach(()=>vi.unstubAllEnvs());
// TEST: changing another SKU must not reparse this box's marks hundreds of times.
it('reuses unchanged demand but reevaluates every contained SKU',()=>{
 vi.stubEnv('WMS_FBO_PLAN_COALESCE_ENABLED','true');
 const f=vi.fn((box:any,d:any)=>({allowed:box.balances.every((b:any)=>d[b.skuId]>=b.quantity)}));
 const box={balances:[{skuId:'a',quantity:2},{skuId:'b',quantity:1}]};const decide=cacheFboBoxDecision(f);
 expect(decide(box,{a:2,b:1,z:100})).toEqual({allowed:true});
 for(let z=99;z>=0;z--)expect(decide(box,{a:2,b:1,z})).toEqual({allowed:true});
 expect(f).toHaveBeenCalledTimes(1);
 expect(decide(box,{a:2,b:0})).toEqual({allowed:false});expect(f).toHaveBeenCalledTimes(2);
 expect(decide(box,{a:1,b:0})).toEqual({allowed:false});expect(f).toHaveBeenCalledTimes(3);
});
it('does not share across boxes or snapshots; flag off preserves calls',()=>{
 vi.stubEnv('WMS_FBO_PLAN_COALESCE_ENABLED','true');const f=vi.fn(()=>true);const box={balances:[{skuId:'a'}]};const d=cacheFboBoxDecision(f);d(box,{a:2});d({...box},{a:2});cacheFboBoxDecision(f)(box,{a:2});expect(f).toHaveBeenCalledTimes(3);
 vi.stubEnv('WMS_FBO_PLAN_COALESCE_ENABLED','false');const old=cacheFboBoxDecision(f);old(box,{a:2});old(box,{a:2});expect(f).toHaveBeenCalledTimes(5);
});
