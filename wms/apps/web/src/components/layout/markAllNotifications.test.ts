import {it,expect,vi} from 'vitest';
import {markAllNotifications} from './markAllNotifications';
const row=(id:number,isRead=false,createdAt='2026-09-28T00:00:00Z')=>({id,isRead,createdAt});
// TEST: all pages, existing receipts, new arrivals, partial failures and retries.
it('marks all history pages and only preexisting unread client notices',async()=>{let clients=[row(4),row(5,false,'2026-10-01T00:00:00Z')];const readAdmin=vi.fn(async()=>{});const readClient=vi.fn(async id=>{clients=clients.filter(n=>String(n.id)!==id);});const api={adminPage:vi.fn(async(cursor?:number)=>cursor?{items:[row(1)],nextBeforeId:null}:{items:[row(3,true),row(2)],nextBeforeId:2}),readAdmin,clientPage:async()=>clients,readClient};expect(await markAllNotifications(api,Date.parse('2026-09-29'))).toBe(3);expect(readAdmin.mock.calls).toEqual([[2],[1]]);expect(readClient.mock.calls).toEqual([['4']]);});
it('reports partial failure and does not claim everything is read',async()=>{await expect(markAllNotifications({clientPage:async()=>[row(1),row(2)],readClient:async id=>{if(id==='2')throw Error('network');}},Date.parse('2026-09-29'))).rejects.toThrow('Отмечено: 1.');});
it('rejects repeated pagination cursors',async()=>{await expect(markAllNotifications({adminPage:async()=>({items:[],nextBeforeId:1}),readAdmin:async()=>{},clientPage:async()=>[],readClient:async()=>{}})).rejects.toThrow('просмотр');});
