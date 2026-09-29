import {useRef,useState} from 'react';
import {markAllNotifications,type NotificationReads} from './markAllNotifications';
// FIX: lock duplicate clicks and refresh counts even after a partial failure.
export function MarkAllNotificationsButton({api,onRefresh}:{api:NotificationReads;onRefresh:()=>void|Promise<unknown>}) {
 const lock=useRef(false);const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 return <div className="notification-read-all"><button type="button" disabled={busy} onClick={async()=>{
  if(lock.current)return;lock.current=true;setBusy(true);setNotice('');
  try{const count=await markAllNotifications(api);setNotice(`Отмечено прочитанными: ${count}.`);}
  catch(e){setNotice(e instanceof Error?e.message:'Не удалось обновить уведомления.');}
  finally{try{await onRefresh();}catch{setNotice('Прочтение сохранено, но счётчик не обновился. Обновите уведомления.');}finally{lock.current=false;setBusy(false);}}
 }}>{busy?'Отмечаю…':'Отметить все прочитанными'}</button>{notice&&<p role="status">{notice}</p>}</div>;
}
