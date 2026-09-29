import {it,expect,vi} from 'vitest';
import {installNetworkLoading} from './networkLoading';
// TEST: parallel completion, rejection and duplicate installation cannot strand the loader.
it('tracks concurrent fetches and preserves errors',async()=>{
 let finish!:(x:any)=>void,fail!:(x:any)=>void;const one=new Promise(r=>finish=r),two=new Promise((_,r)=>fail=r);let active=false;
 const target={fetch:vi.fn().mockReturnValueOnce(one).mockReturnValueOnce(two),document:{documentElement:{toggleAttribute:(_name:string,on:boolean)=>active=on}}};
 installNetworkLoading(target as any);installNetworkLoading(target as any);
 const a=target.fetch('/one'),b=target.fetch('/two');expect(active).toBe(true);finish('response');expect(await a).toBe('response');expect(active).toBe(true);const caught=b.catch((e:any)=>e);const error=Error('abort');fail(error);expect(await caught).toBe(error);expect(active).toBe(false);
});
// TEST: loading continues while the response body is being consumed, even after headers.
it('tracks response body consumption without changing the returned response',async()=>{
 let finish!:(v:any)=>void;let active=false;
 const response={json:()=>new Promise(resolve=>finish=resolve)};
 const target={fetch:vi.fn().mockResolvedValue(response),document:{documentElement:{toggleAttribute:(_name:string,on:boolean)=>active=on}}};
 installNetworkLoading(target as any);
 expect(await target.fetch('/slow')).toBe(response);
 const body=response.json();expect(active).toBe(true);finish({ok:true});expect(await body).toEqual({ok:true});expect(active).toBe(false);
});
