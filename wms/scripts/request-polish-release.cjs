// FIX: surgical patch of the published PR396 graph; no full source rebuild.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {compile}=require('./request-batch-release.cjs');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function edit(s,a,b){if(s.split(a).length!==2)throw Error('Marker drift '+a.slice(0,70));return s.replace(a,b);}
async function build(out){
 if(fs.existsSync(out))throw Error('Use a new candidate directory');
 const get=async url=>{const r=await fetch(url);if(!r.ok)throw Error(url);return r.text()};
 const html=await get('https://wms.logoff.pro/'),entry=html.match(/src="\/assets\/([^"/]+\.js)"/)[1];
 if(entry!=='owner-sorting-20260929-0.js')throw Error('Unexpected production base');
 const graph=new Map(),pending=[entry];while(pending.length){const n=pending.pop();if(graph.has(n))continue;const s=await get('https://wms.logoff.pro/assets/'+n);graph.set(n,s);for(const m of s.matchAll(/["']\.\/([\w.-]+\.js)["']/g))if(!graph.has(m[1]))pending.push(m[1]);}
 if(sha(graph.get(entry))!=='a7ecc3ef5d83212b770709d64b8c80aba36837e590729e9713777cba8ba95217')throw Error('Entry drift');
 const name='owner-sorting-20260929-6.js',original=graph.get(name);
 if(sha(original)!=='24808b0ea2a0a1ec8f703401b363abb7296d4c77e2fd8eb787b91ae929f36375')throw Error('Request module drift');
 let s=original;
 s=edit(s,'e.jsxs(e.Fragment,{children:[e.jsxs("details",{className:"client-request-excel-collapse",children:[e.jsx("summary",{children:"Сборка из Excel"}),e.jsx(ni,{clients:Gs,session:t,onCreated:It})]}),e.jsx(Yl,{clients:Gs,session:t,onCreated:It,outboundOnly:s})]})','e.jsxs("details",{className:"client-request-excel-collapse",children:[e.jsx("summary",{children:"Сборка из Excel"}),e.jsx(ni,{clients:Gs,session:t,onCreated:It}),e.jsx(Yl,{clients:Gs,session:t,onCreated:It,outboundOnly:s})]})');
 s=edit(s,'Gs=o.useMemo(()=>ae.data','[__statusFilter,__setStatusFilter]=o.useState(""),Gs=o.useMemo(()=>ae.data');
 s=edit(s,'.filter(n=>!s||Vt(n))','.filter(n=>!s||Vt(n)).filter(n=>!__statusFilter||n.status===__statusFilter)');
 s=edit(s,'[Y,xs,Je,Se,s]','[Y,xs,Je,Se,s,__statusFilter]');
 s=edit(s,'children:"Сначала большие / новые"','children:Je==="status"?"В обратном порядке этапов":"Сначала большие / новые"');
 s=edit(s,'children:"Сначала маленькие / старые"','children:Je==="status"?"По порядку этапов":"Сначала маленькие / старые"');
 s=edit(s,'e.jsxs("strong",{children:[Is.data.length," заявок"]})','e.jsxs("label",{children:["Статус",e.jsxs("select",{"aria-label":"Статус заявки",value:__statusFilter,onChange:n=>{const v=n.target.value;__setStatusFilter(v);if(v)qs(["DONE","CANCELLED","REJECTED"].includes(v));},children:[e.jsx("option",{value:"",children:"Все статусы"}),...__BatchFeatures.requestStatusOptions.map(n=>e.jsx("option",{value:n.value,children:n.label},n.value))]})]}),e.jsxs("strong",{children:[Is.data.length," заявок"]})');
 s=edit(s,'className:"online-order-age",children:','className:"online-order-age","data-age-zone":minutes>=1140?"critical":minutes>=720?"warning":"normal",children:');
 const marker='const __WmsReact=o;';if(s.split(marker).length!==2)throw Error('Adapter marker drift');
 const compiled=await compile("export{requestStatusOptions}from'./src/components/client-requests/clientRequestMeta';export{WbStatusBadge}from'./src/components/client-requests/WbStatusBadge';export{useRequestBatch}from'./src/components/client-requests/RequestBatchControls';export{compareRequestStatus,missingSourceOnly}from'./src/components/client-requests/requestBatch';export{RequestZoneProvider,RequestZoneContext}from'./src/components/client-requests/RequestZoneProvider';",'__BatchFeatures');
 s=s.split(marker)[0]+marker+compiled;graph.set(name,s);
 const names=Object.fromEntries([...graph.keys()].map((n,i)=>[n,`request-polish-20260929-${i}.js`])),files={};fs.mkdirSync(out,{recursive:true});
 for(const[n,src]of graph){const next=src.replace(/[\w.-]+\.js/g,n=>names[n]||n);fs.writeFileSync(path.join(out,names[n]),next);files[names[n]]={original:n,sha256:sha(next),changed:n===name};}
 const cssName='request-polish-20260929.css',css=fs.readFileSync(path.resolve(__dirname,'../apps/web/src/components/layout/la-panthera-theme.css'),'utf8');fs.writeFileSync(path.join(out,cssName),css);files[cssName]={sha256:sha(css)};
 const index=html.replace('/assets/'+entry,'/assets/'+names[entry]).replace('</head>',`<link rel="stylesheet" href="/assets/${cssName}"></head>`);fs.writeFileSync(path.join(out,'index.html'),index);
 fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify({entry:names[entry],requests:names[name],files},null,2));console.log('Candidate: '+Object.keys(files).length+' assets');
}
if(require.main===module)build(process.argv[2]).catch(e=>{console.error(e);process.exitCode=1});
