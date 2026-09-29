// FIX: patch only the navigation adapter in the verified runtime graph.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {compile}=require('./request-batch-release.cjs');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
async function build(root){
 const before=JSON.parse(fs.readFileSync(path.join(root,'before.json'))),web=path.join(root,'web');
 let html=fs.readFileSync(path.join(web,'index.html'),'utf8');const entry=html.match(/src="\/assets\/([^"/]+\.js)"/)[1];
 const graph=new Map(),pending=[entry];while(pending.length){const n=pending.pop();if(graph.has(n))continue;const s=fs.readFileSync(path.join(web,'assets',n),'utf8');if(sha(s)!==before.web['assets/'+n])throw Error('Runtime drift: '+n);graph.set(n,s);for(const m of s.matchAll(/["']\.\/([\w.-]+\.js)["']/g))if(!graph.has(m[1]))pending.push(m[1]);}
 const original=graph.get(entry),marker='const __WmsReact=x;';if(original.split(marker).length!==2)throw Error('Adapter drift');
 const compiled=await compile("export{PantheraNavigation}from'./src/components/layout/PantheraNavigation';export{installNetworkLoading}from'./src/lib/networkLoading';",'__MainFeatures');
 graph.set(entry,original.split(marker)[0]+marker+compiled+'\n__MainFeatures.installNetworkLoading();\n');
 const names=Object.fromEntries([...graph.keys()].map((n,i)=>[n,`reconciliation-nav-20260929-${i}.js`])),changed=[];
 for(const[n,s]of graph){const next=s.replace(/[\w.-]+\.js/g,n=>names[n]||n),name='assets/'+names[n];fs.writeFileSync(path.join(web,name),next);changed.push(name);}
 const css='assets/reconciliation-nav-20260929.css';fs.writeFileSync(path.join(web,css),fs.readFileSync(path.resolve(__dirname,'../apps/web/src/components/layout/la-panthera-theme.css')));changed.push(css);
 html=html.replace('/assets/'+entry,'/assets/'+names[entry]).replace('</head>',`<link rel="stylesheet" href="/${css}"></head>`);fs.writeFileSync(path.join(web,'index.html'),html);changed.push('index.html');
 fs.writeFileSync(path.join(root,'delta.json'),JSON.stringify(changed));fs.writeFileSync(path.join(root,'proof.json'),JSON.stringify({entry:names[entry],baseEntry:entry,baseHash:sha(original),changed},null,2));console.log('Verified navigation graph:',graph.size,'modules');
}
if(require.main===module)build(process.argv[2]).catch(e=>{console.error(e);process.exitCode=1;});
