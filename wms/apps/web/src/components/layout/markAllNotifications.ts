type Notice = {id:string|number;isRead:boolean;createdAt:string};
type AdminPage = {items:Notice[];nextBeforeId:number|null};
export type NotificationReads = {
 adminPage?: (cursor?:number)=>Promise<AdminPage>;
 readAdmin?: (id:number)=>Promise<unknown>;
 clientPage: ()=>Promise<Notice[]>;
 readClient: (id:string)=>Promise<unknown>;
};
// FIX: use existing scoped endpoints, page through history, and leave new arrivals unread.
export async function markAllNotifications(api:NotificationReads,now=Date.now()) {
 let count=0;const seen=new Set<string>();
 async function read(rows:Notice[],kind:'admin'|'client') {
  const pending=rows.filter(n=>!n.isRead&&Date.parse(n.createdAt)<=now&&!seen.has(kind+':'+n.id));
  for(let i=0;i<pending.length;i+=4){
   const results=await Promise.allSettled(pending.slice(i,i+4).map(async n=>{await (kind==='admin'?api.readAdmin!(Number(n.id)):api.readClient(String(n.id)));seen.add(kind+':'+n.id);count++;}));
   if(results.some(r=>r.status==='rejected'))throw Error(`Отмечено: ${count}. Часть уведомлений не удалось обновить. Повторите действие.`);
  }
  return pending.length;
 }
 if(api.adminPage&&api.readAdmin){let cursor:number|undefined;const cursors=new Set<number>();do{const page=await api.adminPage(cursor);await read(page.items,'admin');const next=page.nextBeforeId;if(next===null)break;if(cursors.has(next))throw Error('Не удалось завершить просмотр уведомлений. Повторите действие.');cursors.add(next);cursor=next;}while(true);}
 while(true){const rows=await api.clientPage();if(!await read(rows,'client'))break;}
 return count;
}
