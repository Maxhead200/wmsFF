import { useEffect, useRef, useState } from 'react';
import type { AuthSession } from '../../lib/api';

type Receipt = {id:string;sourceDocument:string;date:string;received:number;current:boolean;boxes:{code:string}[];fbs:boolean;fbo:boolean;revision:number};
type Change = {id:string;clientId:string;fbs:boolean;fbo:boolean;revision:number};
// FIX: receipt controls have their own date filter and never mutate flags until preview/save succeeds.
export function ReceiptDirectionsPanel({session,fixedClientId}:{session:AuthSession;fixedClientId?:string}) {
  const [client,setClient]=useState(fixedClientId||'');
  const [clients,setClients]=useState<{id:string;name:string}[]>([]);
  const [from,setFrom]=useState(()=>new Date(Date.now()-30*86400000).toISOString().slice(0,10));
  const [to,setTo]=useState(()=>new Date().toISOString().slice(0,10));
  const [rows,setRows]=useState<Receipt[]>([]),[enabled,setEnabled]=useState(false);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [preview,setPreview]=useState<{change:Change;available:number;protectedQuantity:number;excludedQuantity:number}|null>(null);
  const [assignment,setAssignment]=useState<{id:string;boxCode:string;checked?:{series:string;fbs:boolean;fbo:boolean}}|null>(null);
  const generation=useRef(0);
  const admin=session.user.roleCodes.some(r=>r==='ADMIN'||r==='OWNER');
  async function api(url:string,body?:unknown){const response=await fetch(`/api/v1${url}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${session.accessToken}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(Array.isArray(data.message)?data.message.join('; '):data.message||'Не удалось выполнить операцию.');return data;}
  useEffect(()=>{if(admin&&!fixedClientId)void api('/clients').then(setClients).catch(e=>setMessage(e.message));},[session.accessToken,admin,fixedClientId]);
  async function load(){const current=++generation.current;setPreview(null);setAssignment(null);setRows([]);if(!client)return;setBusy(true);setMessage('');try{const data=await api(`/warehouse/receipt-channels?clientId=${encodeURIComponent(client)}&from=${from}&to=${to}`);if(current===generation.current){setRows(data.rows);setEnabled(data.enabled);}}catch(e){if(current===generation.current)setMessage(String((e as Error).message));}finally{if(current===generation.current)setBusy(false);}}
  useEffect(()=>{if(admin)void load();return()=>{generation.current++;};},[client,from,to,session.accessToken,admin]);
  async function change(row:Receipt,channel:'fbs'|'fbo',value:boolean){setBusy(true);setMessage('');setPreview(null);const change={id:row.id,clientId:client,fbs:row.fbs,fbo:row.fbo,revision:row.revision,[channel]:value};try{const result=await api('/warehouse/receipt-channels/preview',change);setPreview({...result,change});}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  async function save(){if(!preview)return;setBusy(true);try{await api('/warehouse/receipt-channels',preview.change);await load();setMessage('Направления приёмки сохранены. Остатки WB пересчитываются при синхронизации.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  async function assign(save:boolean){if(!assignment)return;setBusy(true);setMessage('');try{const data=await api('/warehouse/receipt-channels/assign-box',{id:assignment.id,clientId:client,boxCode:assignment.boxCode,save});if(save){await load();setMessage('Короб отнесён к выбранной приёмке. Штрихкод короба сохранён.');}else setAssignment({...assignment,checked:data});}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  if(!admin)return null;
  return <section className="surface-card receipt-directions" style={{padding:16,marginBottom:16}}><h3>Приёмки · направления отгрузки</h3>
    <p>Приёмки с новыми сканами за последние сутки показаны первыми. ФБС и ФБО можно разрешить одновременно. Уже поступившие заказы ФБС сохраняют доступ к товару.</p>
    <div className="warehouse-drafts__toolbar">
      {!fixedClientId&&<label>Клиент<select disabled={busy} value={client} onChange={e=>setClient(e.target.value)}><option value="">Выберите клиента</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
      <label>С даты<input disabled={busy} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>По дату<input disabled={busy} type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <button type="button" disabled={!client||busy} onClick={()=>void load()}>Обновить</button>
    </div>
    {message&&<p role="status">{message}</p>}{busy&&<p>Проверка…</p>}
    {client&&!busy&&!enabled&&<p>Настройка направлений пока не включена.</p>}
    {enabled&&<div style={{overflowX:'auto'}}><table><thead><tr><th>Дата</th><th>Приёмка / короба</th><th>Принято, шт.</th><th>ФБС</th><th>ФБО</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{new Date(row.date).toLocaleDateString('ru-RU')}</td><td><strong>{row.current?'Новые сканы · ':''}{row.sourceDocument.replace(/^SERIES:\d{4}:/,'')}</strong><details><summary>{row.boxes.length} коробов</summary>{row.boxes.map(b=><div key={b.code}>{b.code}</div>)}</details><button disabled={busy||!!preview||!!assignment} onClick={()=>setAssignment({id:row.id,boxCode:''})}>Добавить ошибочно названный короб</button></td><td>{row.received}</td>{(['fbs','fbo'] as const).map(channel=><td key={channel}><input aria-label={`${channel.toUpperCase()} ${row.sourceDocument}`} type="checkbox" checked={row[channel]} disabled={busy||!!preview||!!assignment} onChange={e=>void change(row,channel,e.target.checked)}/></td>)}</tr>)}</tbody></table>{!rows.length&&<p>Приёмок за выбранный период нет.</p>}</div>}
    {assignment&&<div role="region" aria-label="Привязка короба"><label>Номер короба<input value={assignment.boxCode} disabled={busy} onChange={e=>setAssignment({...assignment,boxCode:e.target.value,checked:undefined})}/></label>{assignment.checked?<><p>Короб будет относиться к {assignment.checked.series.replace(/^SERIES:\d{4}:/,'')}. ФБС: {assignment.checked.fbs?'разрешён':'выключен'}, ФБО: {assignment.checked.fbo?'разрешён':'выключен'}.</p><button disabled={busy} onClick={()=>void assign(true)}>Подтвердить привязку</button></>:<button disabled={busy||!assignment.boxCode.trim()} onClick={()=>void assign(false)}>Проверить короб</button>}<button disabled={busy} onClick={()=>setAssignment(null)}>Отмена</button></div>}
    {preview&&<div role="region" aria-label="Проверка направлений" className="surface-card" style={{padding:16}}><strong>Сохранить: ФБС {preview.change.fbs?'разрешён':'выключен'}, ФБО {preview.change.fbo?'разрешён':'выключен'}</strong><p>Доступно на складе: {preview.available} шт. Под существующие заказы ФБС: {preview.protectedQuantity} шт. Исключается из новых продаж ФБС: {preview.excludedQuantity} шт.</p><button disabled={busy} onClick={()=>void save()}>Сохранить направления</button><button disabled={busy} onClick={()=>setPreview(null)}>Отмена</button></div>}
  </section>;
}
