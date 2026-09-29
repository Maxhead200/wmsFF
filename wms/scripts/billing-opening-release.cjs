// FIX: change only the pinned billing chunk and rewrite its existing import graph.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const rw=createRequire(path.resolve(__dirname,'../apps/web/package.json')),rv=createRequire(rw.resolve('vite/package.json'));
const {parseAst}=rv('rollup/parseAst');
const PIN='9817978eca5233f8e5d405c7fa33f805dc7a5a88245bb85b1446227b0de8fac6';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const oldEffect='if(r.useEffect(()=>{s&&Ee()},[s,B]),';
const newEffect='const __billingFast=typeof window!=="undefined"&&["wms.logoff.pro","localhost","127.0.0.1"].includes(window.location.hostname),__billingGeneration=r.useRef(0);if(r.useEffect(()=>{s&&Ee(!__billingFast);return()=>{__billingGeneration.current+=1}},[s,B,t.accessToken,__billingFast?d:null]),';
const oldLoad='async function Ee(){w(n=>n+1),R(null),';
const newLoad='async function Ee(refreshRegister=true){if(refreshRegister)w(n=>n+1);if(__billingFast)return __billingVisible();R(null),';
const visible=`async function __billingVisible(){
 const generation=++__billingGeneration.current;R(null);
 async function load(fetcher,setter,accepted){
  setter(current=>({...current,status:"loading",error:undefined}));
  try{const data=await fetcher();if(generation!==__billingGeneration.current)return;setter({status:"ready",data});accepted?.(data)}
  catch(caught){if(generation!==__billingGeneration.current)return;setter(current=>({...current,status:"error",error:re(caught)}))}
 }
 const pending=[load(()=>xn(t.accessToken),k,clients=>{te(current=>Lt(current,clients));g(current=>Lt(current,clients))}),load(()=>At(t.accessToken),u),load(()=>bn(t.accessToken),T)];
 if(d==="overview"||d==="charges")pending.push(load(()=>mn(t.accessToken,{clientId:B||undefined}),i));
 if(d==="overview")pending.push(load(()=>Mt(t.accessToken,{clientId:B||undefined}),U));
 if(d==="create")pending.push(load(()=>jn(t.accessToken),_));
 await Promise.all(pending);
}`;
function patch(source){
 if(sha(source)!==PIN)throw Error('Billing runtime drift');
 const edits=[[oldEffect,newEffect],[oldLoad,newLoad],['async function ot(){',visible+'async function ot(){']];
 let result=source;
 for(const [from,to] of edits){if(result.split(from).length!==2)throw Error('Ambiguous marker');result=result.replace(from,to);}
 let undo=result;for(const [from,to] of [...edits].reverse())undo=undo.replace(to,from);
 if(undo!==source)throw Error('Unexpected changes');parseAst(result);return result;
}
async function build(out){
 if(!out||fs.existsSync(out))throw Error('New output directory required');
 async function get(url){const response=await fetch(url);if(!response.ok)throw Error('Fetch failed '+url);return response.text();}
 const index=await get('https://wms.logoff.pro/'),entry=index.match(/src="\/assets\/([^"/]+\.js)"/)[1];
 const graph=new Map(),pending=[entry];
 while(pending.length){const name=pending.pop();if(graph.has(name))continue;const source=await get('https://wms.logoff.pro/assets/'+name);graph.set(name,source);for(const m of source.matchAll(/["']\.\/([\w.-]+\.js)["']/g))if(!graph.has(m[1]))pending.push(m[1]);}
 const matches=[...graph].filter(([,s])=>sha(s)===PIN);if(matches.length!==1)throw Error('Billing chunk missing or changed');
 const target=matches[0][0],prefix='billing-opening-20260929',names=Object.fromEntries([...graph.keys()].map((n,i)=>[n,`${prefix}-${i}.js`])),files={};
 fs.mkdirSync(out,{recursive:true});
 for(const [name,source] of graph){const next=(name===target?patch(source):source).replace(/[\w.-]+\.js/g,n=>names[n]||n);parseAst(next);fs.writeFileSync(path.join(out,names[name]),next);files[names[name]]={sha256:sha(next),original:name,originalSha256:sha(source)};}
 const cssName=prefix+'.css',css='/* Billing loading-only release: existing styles unchanged. */';
 const html=index.replace('/assets/'+entry,'/assets/'+names[entry]).replace('</head>',`<link rel="stylesheet" href="/assets/${cssName}"></head>`);
 fs.writeFileSync(path.join(out,cssName),css);fs.writeFileSync(path.join(out,'index.html'),html);
 fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify({indexBeforeSha:sha(index),indexAfterSha:sha(html),cssName,cssSha:sha(css),files},null,2));
 console.log(JSON.stringify({entry:names[entry],billing:names[target],chunks:graph.size}));
}
module.exports={patch,build,PIN};if(require.main===module)build(process.argv[2]).catch(e=>{console.error(e);process.exitCode=1;});
