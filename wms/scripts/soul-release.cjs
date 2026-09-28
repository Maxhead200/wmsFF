// FIX: additive runtime adapter, pinned to the published entry. No stale full build.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const web=path.resolve(__dirname,'../apps/web'),rw=createRequire(path.join(web,'package.json')),rv=createRequire(rw.resolve('vite/package.json'));
const {parseAst}=rv('rollup/parseAst');
const PIN='7f701f07931d415a67a67cf5b5add6e70ebc3387e34a063e42a3a9106e41c50d';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function once(s,a,b){if(s.split(a).length!==2)throw Error('Ambiguous marker '+a);return s.replace(a,b);}
const original='J5(se.id,t,G,v,m,b,S,q,ne=>{$(ne),v("requests")},()=>$(null),d,l)';
function patchMain(source,compiled){
 if(sha(source)!==PIN)throw Error('Production entry drift');
 const option='{value:"spirit",label:"Spirit"}',nextOption=option+',...(["wms.logoff.pro","localhost","127.0.0.1"].includes(window.location.hostname)?[{value:"soul",label:"Soul"}]:[])';
 const marker='"aria-label":se.title,children:'+original;
 const replacement='"aria-label":se.title,children:m==="soul"?e.jsx(__SoulWorkspace,{groups:A,activeId:se.id,onOpen:v,children:'+original+'}):'+original;
 const append='\nlet __soulComponent;function __SoulWorkspace(props){if(!__soulComponent){const __SoulReact=x;'+compiled+'\n__soulComponent=SoulBuild.SoulWorkspace;}return e.jsx(__soulComponent,props);}\n';
 const body=once(once(source,option,nextOption),marker,replacement);
 if(body.replace(nextOption,option).replace(replacement,marker)!==source)throw Error('Unexpected diff');
 const result=body+append;parseAst(result);return result;
}
async function compile(){return (await rv('esbuild').build({entryPoints:[path.join(web,'src/components/layout/SoulWorkspace.tsx')],bundle:true,write:false,format:'iife',globalName:'SoulBuild',minify:true,target:'es2020',jsx:'transform',jsxFactory:'__SoulReact.createElement',jsxFragment:'__SoulReact.Fragment',tsconfigRaw:{compilerOptions:{jsx:'react'}},plugins:[{name:'live-react',setup(b){b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'live'}));b.onLoad({filter:/.*/,namespace:'live'},()=>({contents:'export default __SoulReact;export const useEffect=__SoulReact.useEffect,useRef=__SoulReact.useRef,useState=__SoulReact.useState;',loader:'js'}));}}]})).outputFiles[0].text;}
async function build(out,patch=patchMain,prefix='soul-live-20260929'){
 if(!out||fs.existsSync(out))throw Error('New output directory required');
 async function get(url){const r=await fetch(url);if(!r.ok)throw Error('Fetch failed '+url);return r.text();}
 const index=await get('https://wms.logoff.pro/'),entry=index.match(/src="\/assets\/([^"/]+\.js)"/)[1],source=await get('https://wms.logoff.pro/assets/'+entry);
 const compiled=await compile(),patched=patch(source,compiled);
 const graph=new Map([[entry,source]]),pending=[entry];
 while(pending.length){const name=pending.pop();for(const m of graph.get(name).matchAll(/["']\.\/([^"']+\.js)["']/g)){const dep=m[1];if(!/^[\w.-]+\.js$/.test(dep))throw Error('Invalid asset');if(graph.has(dep))continue;graph.set(dep,await get('https://wms.logoff.pro/assets/'+dep));pending.push(dep);}}
 const names=Object.fromEntries([...graph.keys()].map((n,i)=>[n,`${prefix}-${i}.js`]));
 const rewrite=s=>s.replace(/[\w.-]+\.js/g,n=>names[n]||n),files={};fs.mkdirSync(out,{recursive:true});
 for(const [name,content] of graph){const next=rewrite(name===entry?patched:content);parseAst(next);fs.writeFileSync(path.join(out,names[name]),next);files[names[name]]={sha256:sha(next),original:name,originalSha256:sha(content)};}
 const css=fs.readFileSync(path.join(web,'src/components/layout/soul-theme.css'),'utf8'),cssName=prefix+'.css';
 const html=once(index,'/assets/'+entry,'/assets/'+names[entry]).replace('</head>',`<link rel="stylesheet" href="/assets/${cssName}"></head>`);
 fs.writeFileSync(path.join(out,cssName),css);fs.writeFileSync(path.join(out,'index.html'),html);
 fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify({indexBeforeSha:sha(index),indexAfterSha:sha(html),cssName,cssSha:sha(css),files},null,2));
 fs.writeFileSync(path.join(out,'original-entry.txt'),source); // local diagnostic artifact, not a deployed asset
 console.log(JSON.stringify({chunks:graph.size,entry:names[entry],cssName}));
}
module.exports={patchMain,compile,build,PIN};if(require.main===module)build(process.argv[2]).catch(e=>{console.error(e);process.exitCode=1;});
