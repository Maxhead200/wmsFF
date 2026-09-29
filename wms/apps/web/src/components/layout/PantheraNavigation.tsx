import { useState } from 'react';
import { Settings, type LucideIcon } from 'lucide-react';
import { SidebarGroup } from './SidebarGroup';

type Item = {id: string; title: string; icon: LucideIcon};
type Group = {id:string; title:string; items:Item[]};
type Props = {groups:Group[]; userId:string; activeId:string; onOpen:(id:string)=>void; kizUnread:number};

// FIX: quick links are copies of authorized items; original groups are never reordered.
export function PantheraNavigation({groups,userId,activeId,onOpen,kizUnread}:Props) {
  const storageKey=`wms.panthera.favorites.${userId}`;
  const [ids,setIds]=useState<string[]>(()=>{
    try {const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(saved)?[...new Set(saved.filter((id):id is string=>typeof id==='string'))]:[];}catch{return [];}
  });
  const [picker,setPicker]=useState(false),[editing,setEditing]=useState(false);
  const available=groups.flatMap(group=>group.items).filter(item=>item.id!=='overview');
  const favorites=ids.flatMap(id=>available.find(item=>item.id===id)??[]);
  function save(next:string[]){setIds(next);try{localStorage.setItem(storageKey,JSON.stringify(next));}catch{/* Preferences remain available during this session. */}}
  function itemButton(item:Item){const Icon=item.icon;return <button key={item.id} type="button" className={item.id===activeId?'active':''} onClick={()=>onOpen(item.id)}>
    <Icon size={18} aria-hidden={true}/><span>{item.title}</span>
    {item.id==='kiz'&&kizUnread>0?<strong className="workspace-nav__badge" aria-label={`Непрочитанных проблем КИЗ: ${kizUnread}`}>{kizUnread>99?'99+':kizUnread}</strong>:null}
  </button>;}
  const quickLinks=<section className="workspace-favorites" aria-label="Часто используемые" onContextMenu={event=>{event.preventDefault();setEditing(true);}}>
    <div className="workspace-favorites__heading"><strong>Часто используемые</strong><button type="button" aria-label={editing?'Завершить редактирование быстрых ссылок':'Редактировать быстрые ссылки'} aria-pressed={editing} onClick={()=>setEditing(!editing)}><Settings size={16} aria-hidden="true"/></button><button type="button" aria-label="Добавить быструю ссылку" aria-expanded={picker} onClick={()=>setPicker(!picker)}>+</button></div>
    {favorites.map(item=><div className="workspace-favorites__item" key={item.id}>{itemButton(item)}{editing?<button type="button" className="workspace-favorites__remove" aria-label={`Убрать быструю ссылку: ${item.title}`} onClick={()=>save(ids.filter(id=>id!==item.id))}>−</button>:null}</div>)}
    {picker?<div className="workspace-favorites__picker" role="group" aria-label="Выбор быстрых ссылок">{available.filter(item=>!ids.includes(item.id)).map(item=><button type="button" key={item.id} onClick={()=>save([...ids,item.id])}>+ {item.title}</button>)}<button type="button" onClick={()=>setPicker(false)}>Готово</button></div>:null}
  </section>;
  const overviewIndex=groups.findIndex(group=>group.items.some(item=>item.id==='overview'));
  return <>{groups.map((group,index)=><div className="workspace-nav__group-slot" key={group.id}>
    <SidebarGroup id={group.id} title={group.title} userId={userId} activeId={group.items.some(item=>item.id===activeId)?activeId:null} collapsible={!group.items.some(item=>item.id==='overview')}>
      {group.items.map(itemButton)}
    </SidebarGroup>
    {index===Math.max(0,overviewIndex)?quickLinks:null}
  </div>)}</>;
}
