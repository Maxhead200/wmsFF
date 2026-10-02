// FIX: additive release over pinned live modules; never deploy the source build wholesale.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const web=path.resolve(__dirname,'../apps/web'),rw=createRequire(web+'/package.json'),rv=createRequire(rw.resolve('vite/package.json'));
const {parseAst}=rv('rollup/parseAst'),esbuild=rv('esbuild');
const PIN='25b52c5a0ac2ca5c48b83de3dd9eae1650fe65dd758dbb56781075060c4760ab';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function edits(source,changes){let out=source;for(const[from,to]of changes){if(out.split(from).length!==2)throw Error('Ambiguous release marker: '+from);out=out.replace(from,()=>to)}let undo=out;for(const[from,to]of [...changes].reverse())undo=undo.replace(to,()=>from);if(undo!==source)throw Error('Reverse patch mismatch');return out;}
function patchWeb(source,panel){
 if(sha(source)!==PIN)throw Error('Billing chunk drift');
 const out=edits(source,[['function ia({session:t}){',panel+'\nfunction ia({session:t}){'],
 ['Ei.map(n=>e.jsx("button",', '__billingFast?e.jsx("button",{role:"tab",type:"button","aria-selected":d==="settlements",className:d==="settlements"?"active":"",onClick:()=>I("settlements"),children:"Клиенты и расчёты"}):null,Ei.map(n=>e.jsx("button",'],
 ['G?e.jsx("p",{className:"form-error",children:G}):null,d==="home"?', 'G?e.jsx("p",{className:"form-error",children:G}):null,d==="settlements"&&__billingFast?e.jsx(__billingSettlements.BillingSettlementsPanel,{session:t,clients:h.data,revision:C,onReview:(id,section)=>{te(id);g(id);I(section)}}):null,d==="home"?']]);parseAst(out);return out;
}
function patchApiModule(source){
 if(sha(source)!=='442bbc61c9fc2cc6003325032bd22f55d0d7264f4ea91e92fdce6a6db7fa4d42')throw Error('Billing module drift');
 return edits(source,[['let BillingModule = class BillingModule {','const settlements_controller = require("./billing-settlements.controller");\nconst settlements_service = require("./billing-settlements.service");\nlet BillingModule = class BillingModule {'],
 ['controllers: [billing_controller_1.BillingController]', 'controllers: [billing_controller_1.BillingController, settlements_controller.BillingSettlementsController]'],
 ['providers: [billing_service_1.BillingService,','providers: [settlements_service.BillingSettlementsService, billing_service_1.BillingService,']]);
}
function patchCatalog(source){
 if(sha(source)!=='886db621fedfa0d1ed49dd62ad05acff3fe7f944a229bdf8b05c85668bc4229f')throw Error('API catalog drift');
 return edits(source,[["prefixes: ['/billing'],", "prefixes: ['/billing', '/billing/settlements'],"],['routeCount: 42, // FIX: JSON POST preview','routeCount: 43, // FIX: JSON POST preview']]);
}
async function build(base,candidate,compiled,out){
 if(fs.existsSync(out))throw Error('New release directory required');fs.mkdirSync(out,{recursive:true});
 const built=await esbuild.build({entryPoints:[web+'/src/components/billing/BillingSettlementsPanel.tsx'],bundle:true,write:false,format:'iife',globalName:'__billingSettlements',jsx:'transform',jsxFactory:'r.createElement',jsxFragment:'r.Fragment',minify:true,
  define:{'import.meta.env.VITE_API_URL':'"/api/v1"'},plugins:[{name:'live-react',setup(b){b.onResolve({filter:/^react(\/jsx-runtime)?$/},args=>({path:args.path,namespace:'live'}));b.onLoad({filter:/.*/,namespace:'live'},args=>({contents:args.path==='react'?'export const useState=r.useState,useEffect=r.useEffect;':'export const jsx=e.jsx,jsxs=e.jsxs,Fragment=e.Fragment;'}));b.onLoad({filter:/billing-settlements\.css$/},()=>({contents:'',loader:'js'}));}}]});
 const panel=built.outputFiles[0].text,dir=path.join(base,'web'),html=fs.readFileSync(dir+'/index.html','utf8'),entry=html.match(/src="\/assets\/([^"/]+\.js)"/)[1];
 const graph=new Map(fs.readdirSync(dir).filter(n=>n.endsWith('.js')).map(n=>[n,fs.readFileSync(path.join(dir,n),'utf8')]));
 const targets=[...graph].filter(([,s])=>sha(s)===PIN);if(targets.length!==1)throw Error('Pinned billing chunk missing');
 const target=targets[0][0],prefix='billing-settlements-20261002',names=Object.fromEntries([...graph.keys()].map((n,i)=>[n,`${prefix}-${i}.js`])),files={};fs.mkdirSync(out+'/web');fs.mkdirSync(out+'/api');
 for(const[name,source]of graph){const next=(name===target?patchWeb(source,panel):source).replace(/[\w.-]+\.js/g,n=>names[n]||n);parseAst(next);fs.writeFileSync(out+'/web/'+names[name],next);files[names[name]]={sha256:sha(next),original:name,originalSha256:sha(source)};}
 const cssName=prefix+'.css',css=fs.readFileSync(web+'/src/components/billing/billing-settlements.css');files[cssName]={sha256:sha(css)};fs.writeFileSync(out+'/web/'+cssName,css);
 const index=html.replace('/assets/'+entry,'/assets/'+names[entry]).replace('</head>',`<link rel="stylesheet" href="/assets/${cssName}"></head>`);fs.writeFileSync(out+'/web/index.html',index);
 fs.writeFileSync(out+'/web/proof.json',JSON.stringify({indexBeforeSha:sha(html),indexAfterSha:sha(index),files,billing:names[target],entry:names[entry]},null,2));
 const mods=['modules/billing/billing.module.js','modules/administration/administration-internal-api.service.js'];
 const api={};for(const n of [...mods,...['policy','service','controller'].map(s=>'modules/billing/billing-settlements.'+s+'.js')]){
  let data;if(mods.includes(n)){const s=fs.readFileSync(path.join(candidate,n),'utf8');data=n===mods[0]?patchApiModule(s):patchCatalog(s)}else data=fs.readFileSync(path.join(compiled,n));
  for(const root of [candidate,out+'/api']){const p=path.join(root,n);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data)}api[n]=sha(data);
 }fs.writeFileSync(out+'/api/proof.json',JSON.stringify(api,null,2));fs.copyFileSync(base+'/manifest.json',out+'/manifest.json');console.log(JSON.stringify({apiFiles:Object.keys(api),webChunks:graph.size,billing:names[target],entry:names[entry]}));
}
module.exports={edits,patchWeb,patchApiModule,patchCatalog,build,PIN};if(require.main===module)build(...process.argv.slice(2)).catch(e=>{console.error(e);process.exitCode=1});
