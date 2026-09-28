// FIX: read the existing menu without importing production UI, authentication or API code.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../apps/web/src');
const source=fs.readFileSync(path.join(root,'lib/workspaces.ts'),'utf8').split('const workspaceDefinitions: WorkspaceNavItem[] = [')[1].split('\n];')[0];
const app=fs.readFileSync(path.join(root,'App.tsx'),'utf8');
const grouping=app.split('function sectionForWorkspace(')[1].split('function audienceLabel')[0];
const items=[...source.matchAll(/\{\s*id: '([^']+)'[\s\S]*?title: '([^']+)'[\s\S]*?description: '([^']+)'/g)].map(m=>({id:m[1],title:m[2],description:m[3]}));
function section(id){
 for(const m of grouping.matchAll(/if\s*\(([^)]+)\)\s*(?:\{\s*)?return '([^']+)'/g)){
  if([...m[1].matchAll(/id === '([^']+)'/g)].some(x=>x[1]===id))return m[2];
 }return 'control';
}
const menu=[['client','Клиентский контур','Заказы, товары и отношения с клиентами'],['operations','Склад и операции','Движение товара от приёмки до отгрузки'],['management','Управление','Финансы, команда и инфраструктура'],['control','Контроль','Наблюдение, диагностика и инструменты']].map(([id,title,description])=>({id,title,description,items:items.filter(i=>section(i.id)===id)}));
function transition(state,action){
 if(action.type==='home')return {group:null,selected:null};
 if(action.type==='group'&&menu.some(g=>g.id===action.id))return {...state,group:action.id};
 if(action.type==='open'){const g=menu.find(g=>g.items.some(i=>i.id===action.id));if(g)return {group:g.id,selected:action.id};}
 return state;
}
function pageType(id){return ['imports','integration-api','logistics','services','print','relabeling','debug','ai','service'].includes(id)?'form':['cabinet','analytics','operations-statistics','branches','storage-zones','monitoring','administration','access','factory'].includes(id)?'cards':'table';}
module.exports={menu,transition,pageType};
