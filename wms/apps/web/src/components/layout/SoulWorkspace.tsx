import React, {useEffect, useRef, useState, type ReactNode} from 'react';
import {SoulAppearance} from './SoulAppearance';

type SoulItem = {id:string; title:string; description?:string};
type SoulGroup = {id:string; title:string; items:SoulItem[]};
export const soulEnabled=(hostname:string)=>['wms.logoff.pro','localhost','127.0.0.1'].includes(hostname);
export function soulGroups(groups:SoulGroup[]){return groups.map(g=>({...g,items:g.items.filter(i=>i.id!=='overview')})).filter(g=>g.items.length>0);}
// FIX: only navigation is new. Existing page children, permissions and callbacks remain authoritative.
export function SoulWorkspace({groups,activeId,onOpen,children,enabled=true,userId='local'}:{groups:SoulGroup[];activeId:string;onOpen:(id:string)=>void;children:ReactNode;enabled?:boolean;userId?:string}){
 const visible=soulGroups(groups),activeGroup=visible.find(g=>g.items.some(i=>i.id===activeId))?.id;
 const [browse,setBrowse]=useState(activeGroup),lastActive=useRef(activeId),nav=useRef<HTMLElement>(null);
 useEffect(()=>{if(lastActive.current!==activeId){setBrowse(activeGroup);lastActive.current=activeId;}},[activeId,activeGroup]);
 if(!enabled)return <>{children}</>;
 const home=activeId==='overview',expanded=visible.find(g=>g.id===browse)||visible.find(g=>g.id===activeGroup)||visible[0];
 const symbols:Record<string,string>={client:'◈',operations:'▦',management:'◇',control:'◎'};
 const open=(id:string)=>{if(visible.some(g=>g.items.some(i=>i.id===id)))onOpen(id);};
 const card=(g:SoulGroup)=><section className={`soul-group soul-${g.id}`} key={g.id} aria-label={g.title}>
   <header><span className="soul-symbol" aria-hidden="true">{symbols[g.id]||'◇'}</span><div><h2>{g.title}</h2><small>{g.items.length} разделов</small></div></header>
   <div className="soul-items">{g.items.map((i,n)=><button key={i.id} data-soul-open={i.id} type="button" title={i.description} aria-current={activeId===i.id?'page':undefined} onClick={()=>open(i.id)}><span className="soul-number" aria-hidden="true">{String(n+1).padStart(2,'0')}</span><span>{i.title}</span><span className="soul-arrow" aria-hidden="true">↗</span></button>)}</div>
 </section>;
 return <div className="soul-workspace">
   {/* FIX: requested WMS LOGOff heading; theme selector remains Soul. */}
   <div className="soul-toolbar">{!home?<button type="button" onClick={()=>{onOpen('overview');setBrowse(undefined);}}>← Все разделы</button>:<h1>WMS LOGOff</h1>}<SoulAppearance key={userId} userId={userId}/></div>
   <nav ref={nav} className={home?'soul-home-grid':'soul-expanded'} aria-label="Разделы Soul">
    {!home&&<div className="soul-group-tabs">{visible.map(g=><button className={`soul-${g.id}`} type="button" key={g.id} data-soul-group={g.id} aria-expanded={expanded?.id===g.id} onClick={()=>setBrowse(g.id)}><span aria-hidden="true">{symbols[g.id]||'◇'}</span> {g.title}</button>)}</div>}
    {home?visible.map(card):expanded&&card(expanded)}
   </nav>
   {!home&&<div className="soul-page" data-soul-page={activeId}>{children}</div>}
 </div>;
}
