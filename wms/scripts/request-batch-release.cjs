// FIX: narrow runtime adapters; never replace the divergent production application with a full source build.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const web=path.resolve(__dirname,'../apps/web'),req=createRequire(path.join(web,'package.json')),vite=createRequire(req.resolve('vite/package.json'));
const {parseAst}=vite('rollup/parseAst');
const MAIN='aaa92451369e151246090a90748832357dd5537e39a545aca28a98e5fb5c3da4',REQUESTS='9bcbe1f4d09c73a95c3286e9599733bb30caf91c8cf83ce03e72421c012b8bd3';
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function edits(source,pairs){let result=source;for(const [from,to]of pairs){if(result.split(from).length!==2)throw Error('Ambiguous runtime marker: '+from.slice(0,100));result=result.replace(from,to);}let undo=result;for(const [from,to]of [...pairs].reverse())undo=undo.replace(to,from);if(undo!==source)throw Error('Unexpected runtime edit');return result;}
async function compile(contents,name){return(await vite('esbuild').build({stdin:{contents,resolveDir:web,loader:'ts'},bundle:true,write:false,format:'iife',globalName:name,minify:true,target:'es2020',jsx:'transform',jsxFactory:'__WmsReact.createElement',jsxFragment:'__WmsReact.Fragment',tsconfigRaw:{compilerOptions:{jsx:'react'}},plugins:[{name:'runtime-react',setup(b){b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'live'}));b.onLoad({filter:/.*/,namespace:'live'},()=>({contents:'export default __WmsReact;export const useState=__WmsReact.useState,useEffect=__WmsReact.useEffect,useRef=__WmsReact.useRef,useMemo=__WmsReact.useMemo,useCallback=__WmsReact.useCallback,forwardRef=__WmsReact.forwardRef,createElement=__WmsReact.createElement,createContext=__WmsReact.createContext,useContext=__WmsReact.useContext;',loader:'js'}));}}]})).outputFiles[0].text;}
function patchMain(source,compiled){
 if(sha(source)!==MAIN)throw Error('Main runtime drift');
 const marker='className:"workspace-nav",children:A.map';
 const next='className:"workspace-nav",children:m==="la_panthera"?e.jsx(__MainFeatures.PantheraNavigation,{key:t.user.id,groups:A,userId:t.user.id,activeId:se.id,onOpen:v,kizUnread:S}):A.map';
 return edits(source,[[marker,next]])+'\nconst __WmsReact=x;'+compiled+'\n__MainFeatures.installNetworkLoading();\n';
}
function patchRequests(source,compiled){
 if(sha(source)!==REQUESTS)throw Error('Requests runtime drift');
 const pairs=[
  ['n.status==="DONE"||n.status==="CANCELLED";return Se','n.status==="DONE"||n.status==="CANCELLED"||n.status==="REJECTED";return Se'],
  ['"WB: ",m.wbStatus,m.kiz','e.jsx(__BatchFeatures.WbStatusBadge,{status:m.wbStatus}),m.kiz'],
  ['type:"button",disabled:te,onClick:()=>y(m)','type:"button",className:"wb-shipment-action",disabled:te,onClick:()=>y(m)'],
  ['[Y,xs,Je,Se,s]),ds=o.useMemo','[Y,xs,Je,Se,s]),__batch=__BatchFeatures.useRequestBatch({items:Is.data,enabled:!Se&&y,token:t.accessToken,fetchSelection:tt,updateStatus:nt,reload:ke}),ds=o.useMemo'],
  ['.sort((n,l)=>{const x=Je===','.sort((n,l)=>{if(Je==="status")return __BatchFeatures.compareRequestStatus(n,l)*(xs==="asc"?1:-1);const x=Je==='],
  ['e.jsx("option",{value:"quantity",children:"По количеству товаров"})','e.jsx("option",{value:"quantity",children:"По количеству товаров"}),e.jsx("option",{value:"status",children:"По статусу"})'],
  ['e.jsx(ni,{clients:Gs,session:t,onCreated:It})','e.jsxs("details",{className:"client-request-excel-collapse",children:[e.jsx("summary",{children:"Сборка из Excel"}),e.jsx(ni,{clients:Gs,session:t,onCreated:It})]})'],
  ['e.jsx("div",{className:"client-requests-panel__list",children:Gi(Is,Vs,js,cs,y,b,h,X,b&&X,','__batch.controls,e.jsx("div",{className:"client-requests-panel__list",children:Gi(Is,__batch.active?__batch.selectable:Vs,__batch.active?__batch.selected:js,__batch.active?__batch.setSelected:cs,y&&!__batch.busy,b&&!__batch.busy,h&&!__batch.busy,X&&!__batch.busy,b&&X&&!__batch.busy,'],
  ['onShipOutbound:ge}){const S=s.filter','onShipOutbound:ge}){const __zones=o.useContext(__BatchFeatures.RequestZoneContext);const S=s.filter'],
  ['return e.jsxs("tr",{className:`client-request-row client-request-row--','return e.jsxs("tr",{"data-request-zone":__zones[c.id],className:`client-request-row client-request-row--'],
  ['children:Gi(Is,__batch.active','children:e.jsx(__BatchFeatures.RequestZoneProvider,{items:Is.data,token:t.accessToken,fetchOrders:el,children:Gi(Is,__batch.active'],
  [',p?n=>void Un(n):void 0,g)}),A?',',p?n=>void Un(n):void 0,g)})}),A?'],
  ['P=re.stockSources}await nt(t.accessToken,Re.request.id,','P=re.stockSources}else{const __selection=await tt(t.accessToken,Re.request.id),__missing=__BatchFeatures.missingSourceOnly(__selection.items);P=__missing.length?__missing:void 0}await nt(t.accessToken,Re.request.id,'],
 ];
 let result=edits(source,pairs);
 result=result.replaceAll('Выбрать FBS-заявку','Выбрать заявку').replaceAll('Выбрать все незавершённые FBS-заявки','Выбрать все доступные заявки на экране').replaceAll('"data-label":"В хвосты"','"data-label":"Выбор"');
 return result+'\nconst __WmsReact=o;'+compiled;
}
async function build(out){
 if(!out||fs.existsSync(out))throw Error('New output directory required');
 const get=async url=>{const response=await fetch(url);if(!response.ok)throw Error('Fetch failed '+url);return response.text();};
 const index=await get('https://wms.logoff.pro/'),entry=index.match(/src="\/assets\/([^"/]+\.js)"/)[1];
 const graph=new Map(),pending=[entry];
 while(pending.length){const name=pending.pop();if(graph.has(name))continue;const source=await get('https://wms.logoff.pro/assets/'+name);graph.set(name,source);for(const m of source.matchAll(/["']\.\/([\w.-]+\.js)["']/g))if(!graph.has(m[1]))pending.push(m[1]);}
 if(sha(graph.get(entry))!==MAIN)throw Error('Live entry changed');
 const matches=[...graph].filter(([,source])=>sha(source)===REQUESTS);if(matches.length!==1)throw Error('Live requests changed');
 const main=await compile("export{PantheraNavigation}from'./src/components/layout/PantheraNavigation';export{installNetworkLoading}from'./src/lib/networkLoading';",'__MainFeatures');
 const batch=await compile("export{WbStatusBadge}from'./src/components/client-requests/WbStatusBadge';export{useRequestBatch}from'./src/components/client-requests/RequestBatchControls';export{compareRequestStatus,missingSourceOnly}from'./src/components/client-requests/requestBatch';export{RequestZoneProvider,RequestZoneContext}from'./src/components/client-requests/RequestZoneProvider';",'__BatchFeatures');
 const prefix='requests-theme-20260929',names=Object.fromEntries([...graph.keys()].map((name,i)=>[name,`${prefix}-${i}.js`])),files={};
 fs.mkdirSync(out,{recursive:true});
 for(const[name,source]of graph){let patched=name===entry?patchMain(source,main):name===matches[0][0]?patchRequests(source,batch):source;parseAst(patched);const next=patched.replace(/[\w.-]+\.js/g,n=>names[n]||n);parseAst(next);fs.writeFileSync(path.join(out,names[name]),next);files[names[name]]={original:name,originalSha256:sha(source),sha256:sha(next),changed:name===entry||name===matches[0][0]};}
 const styles=[['panthera-surfaces-20260929.css','components/layout/la-panthera-theme.css'],['panthera-network-20260929.css','components/layout/la-panthera-loader.css'],['request-batch-20260929.css','components/client-requests/request-batch.css']];
 for(const[name,source]of styles){const css=fs.readFileSync(path.join(web,'src',source),'utf8');fs.writeFileSync(path.join(out,name),css);files[name]={sha256:sha(css)};}
 const html=index.replace('/assets/'+entry,'/assets/'+names[entry]).replace('</head>',styles.map(([name])=>`<link rel="stylesheet" href="/assets/${name}">`).join('')+'</head>');
 fs.writeFileSync(path.join(out,'index.html'),html);fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify({indexBeforeSha:sha(index),indexAfterSha:sha(html),entry:names[entry],requests:names[matches[0][0]],files},null,2));
 console.log(JSON.stringify({chunks:graph.size,entry:names[entry],requests:names[matches[0][0]]}));
}
module.exports={build,patchMain,patchRequests,compile};if(require.main===module)build(process.argv[2]).catch(e=>{console.error(e);process.exitCode=1;});
