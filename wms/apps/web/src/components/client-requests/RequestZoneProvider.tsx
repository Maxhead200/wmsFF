import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ClientRequestSummary, FbsOrderSummary, fetchFbsOrders } from '../../lib/api';
import { requestZoneTones } from './requestZoneTones';
export const RequestZoneContext=createContext<ReturnType<typeof requestZoneTones>>({});
// FIX: cosmetic data is loaded only in la_panthera, without forcing marketplace synchronization.
export function RequestZoneProvider({items,token,fetchOrders,children}:{items:ClientRequestSummary[];token:string;fetchOrders:typeof fetchFbsOrders;children:ReactNode}){
  const isPanthera=()=>document.documentElement.dataset.uiVariant==='la_panthera';
  const [enabled,setEnabled]=useState(isPanthera),[orders,setOrders]=useState<FbsOrderSummary[]>([]),[now,setNow]=useState(Date.now);
  useEffect(()=>{const observer=new MutationObserver(()=>setEnabled(isPanthera()));observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-ui-variant']});return()=>observer.disconnect();},[]);
  useEffect(()=>{
    let stopped=false;setOrders([]);
    if(!enabled)return;
    const clients=[...new Set(items.filter(item=>!['DONE','CANCELLED','REJECTED'].includes(item.status)&&(item._count?.fbsOrderLinks??0)>0).map(item=>item.clientId))];
    let next=0;const loaded:FbsOrderSummary[]=[];
    async function worker(){while(!stopped&&next<clients.length){const client=clients[next++];try{const data=await fetchOrders(token,client,false);if(!stopped){loaded.push(...data.orders);setOrders([...loaded]);}}catch{/* Keep a neutral colour when source information is unavailable. */}}}
    void Promise.all([worker(),worker()]);
    return()=>{stopped=true;};
  },[enabled,items,token,fetchOrders]);
  useEffect(()=>{if(!enabled)return;const timer=window.setInterval(()=>setNow(Date.now()),60000);return()=>window.clearInterval(timer);},[enabled]);
  const tones=useMemo(()=>enabled?requestZoneTones(orders,now):{},[enabled,orders,now]);
  return <RequestZoneContext.Provider value={tones}>{children}</RequestZoneContext.Provider>;
}
