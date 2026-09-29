// FIX: surgical runtime delta from the current verified baseline, never a full source rebuild.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {compile}=require('./request-batch-release.cjs');
const ts=require('../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript');
const w=path.resolve(__dirname,'..'),r=path.resolve(process.argv[2]),base=path.join(w,'baselines/our-wms/2026-09-29-fbs-zone-colors');
const before=JSON.parse(fs.readFileSync(path.join(r,'before.json'))),manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json')));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function edit(s,a,b){if(s.split(a).length!==2)throw Error('Ambiguous marker '+a.slice(0,100));return s.replace(a,b);}
function write(p,s){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);}
(async()=>{
for(const [n,v]of Object.entries(manifest.containers))if(before.containers[n].image!==v.image)throw Error('Live images differ from baseline');
const api=path.join(r,'api');fs.cpSync(path.join(r,'api-base'),api,{recursive:true});
const changed=['common/stock/ordinary-unmarked-pick.js','common/stock/fbs-request-auto-status.js','modules/tsd/tsd-assembly.service.js'];
const transpile=n=>ts.transpileModule(fs.readFileSync(path.join(w,'apps/api/src',n+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
write(path.join(api,changed[0]),transpile('common/stock/ordinary-unmarked-pick'));
let a=fs.readFileSync(path.join(api,changed[1]),'utf8');
a=edit(a,'"use strict";','"use strict";\nconst ordinary_unmarked_pick_1 = require("./ordinary-unmarked-pick");\nconst wb_order_stock_lifecycle_1 = require("./wb-order-stock-lifecycle");');
a=edit(a,'status: true, itemCount: true, startedAt:','requiresKiz: true, kiz: true, barcode: true, sourceBoxPending: true,\n            status: true, itemCount: true, startedAt:');
const compiled=transpile('common/stock/fbs-request-auto-status');const start=compiled.indexOf('    // FIX: final physical pick');const end=compiled.indexOf('    if (rank[target]',start);if(start<0||end<0)throw Error('Missing ordinary block');
a=edit(a,'    if (rank[target]',compiled.slice(start,end)+'    if (rank[target]');
a=edit(a,"body: target === 'DONE' ?","body: ordinaryClosed ? 'Все товары без КИЗ отобраны и упакованы; складское списание подтверждено.' : target === 'DONE' ?");write(path.join(api,changed[1]),a);
let t=fs.readFileSync(path.join(api,changed[2]),'utf8');t=edit(t,'"use strict";','"use strict";\nconst ordinary_unmarked_pick_1 = require("../../common/stock/ordinary-unmarked-pick");');
t=edit(t,'sourceSkuId: true, // FIX: source stock','marketplace: true,\n                    sourceSkuId: true, // FIX: source stock');
t=edit(t,'statusLabel: fbsAssemblyStatusLabel(row.status)','statusLabel: (0, ordinary_unmarked_pick_1.ordinaryPickStatusLabel)(row, fbsAssemblyStatusLabel(row.status))');
t=edit(t,'assemblyStatusLabel: task ? fbsAssemblyStatusLabel(task.status) :','assemblyStatusLabel: task ? (0, ordinary_unmarked_pick_1.ordinaryPickStatusLabel)(task, fbsAssemblyStatusLabel(task.status)) :');write(path.join(api,changed[2]),t);
for(const n of changed)cp.execFileSync(process.execPath,['--check',path.join(api,n)]);
write(path.join(r,'api-delta.json'),JSON.stringify(changed));
const web=path.join(r,'web');fs.mkdirSync(web,{recursive:true});cp.execFileSync('tar',['-xzf',path.join(base,'web-runtime.tar.gz'),'-C',web]);
const index=fs.readFileSync(path.join(web,'index.html'),'utf8'),entry=index.match(/src="\/assets\/([^"/]+\.js)"/)[1];
const graph=new Map(),pending=[entry];while(pending.length){const n=pending.pop();if(graph.has(n))continue;const s=fs.readFileSync(path.join(web,'assets',n),'utf8');graph.set(n,s);for(const m of s.matchAll(/["']\.\/([\w.-]+\.js)["']/g))if(!graph.has(m[1]))pending.push(m[1]);}
let main=graph.get(entry);
const marker='const __WmsReact=x;';if(main.split(marker).length!==2)throw Error('Main tail drift');
const features=await compile("export{PantheraNavigation}from'./src/components/layout/PantheraNavigation';export{installNetworkLoading}from'./src/lib/networkLoading';export{MarkAllNotificationsButton}from'./src/components/layout/MarkAllNotificationsButton';export{KizReviewCard}from'./src/components/kiz/KizReviewCard';export{reviewWeek}from'./src/components/kiz/reviewWeek';",'__MainFeatures');
main=main.split(marker)[0]+marker+features+'\n__MainFeatures.installNetworkLoading();\n';
main=edit(main,'const L=await uT(t.accessToken,T);','const L=__MainFeatures.reviewWeek(await uT(t.accessToken,T));');
main=edit(main,'Проблемные КИЗы поступают сюда автоматически. Решение действует только для указанного задания.','Обращения за последние 7 дней. Проблемные КИЗы поступают сюда автоматически. Решение действует только для указанного задания.');
const cardStart=main.indexOf('function p4('),cardEnd=main.indexOf('function m4(',cardStart);if(cardStart<0||cardEnd<0)throw Error('Review card drift');main=main.slice(0,cardStart)+'function p4(props){return e.jsx(__MainFeatures.KizReviewCard,props)}'+main.slice(cardEnd);
main=edit(main,'e.jsx(tO,{state:i,onOpen:K}),','e.jsx(__MainFeatures.MarkAllNotificationsButton,{api:{adminPage:i.enabled?cursor=>v0(t.accessToken,cursor):void 0,readAdmin:id=>aA(t.accessToken,id),clientPage:()=>t.user.permissionCodes.includes("client-notifications:read")?mo(t.accessToken,{unreadOnly:true}):Promise.resolve([]),readClient:id=>pw(t.accessToken,id)},onRefresh:async()=>{await i.latest();window.dispatchEvent(new Event("client-notifications-changed"));}}),e.jsx(tO,{state:i,onOpen:K}),');
const names=Object.fromEntries([...graph.keys()].map((n,i)=>[n,`ordinary-pick-reviews-20260929-${i}.js`]));const delta=[];
for(const[n,s]of graph){const next=(n===entry?main:s).replace(/[\w.-]+\.js/g,n=>names[n]||n);const file='assets/'+names[n];write(path.join(web,file),next);cp.execFileSync(process.execPath,['--check',path.join(web,file)]);delta.push(file);}
const css=fs.readFileSync(path.join(w,'apps/web/src/components/layout/la-panthera-theme.css'),'utf8'),cm='/* FIX: monitoring across the top';if(css.split(cm).length!==2)throw Error('CSS marker');const cssName='assets/ordinary-pick-reviews-20260929.css';write(path.join(web,cssName),cm+css.split(cm)[1]);delta.push(cssName);
write(path.join(web,'index.html'),index.replace('/assets/'+entry,'/assets/'+names[entry]).replace('</head>',`<link rel="stylesheet" href="/${cssName}"></head>`));delta.push('index.html');write(path.join(r,'delta.json'),JSON.stringify(delta));
console.log(JSON.stringify({apiChanged:changed,webGraph:graph.size,entry:names[entry]}));
})().catch(e=>{console.error(e);process.exitCode=1;});
