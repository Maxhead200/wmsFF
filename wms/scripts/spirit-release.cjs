// FIX: publish Spirit additively over the exact current runtime; never rebuild old application code.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const web=path.resolve(__dirname,'../apps/web'),rw=createRequire(path.join(web,'package.json'));
const rv=createRequire(rw.resolve('vite/package.json')), {parseAst}=rv('rollup/parseAst');
const PIN='02b5e8d419c16fc03875c47431ea4adb85c9edbeff87a45a9d27a5fa62c4b4b8';
const ANALYTICS='a30a5e91ac95203011417abb9639ad73e9739ab3eacb39244fa82bc498e513b8';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function once(s,a,b){if(s.split(a).length!==2)throw Error('Ambiguous marker: '+a);return s.replace(a,b)}
function patchMain(source){
 if(sha(source)!==PIN)throw Error('Production entry drift');
 const a='{value:"space",label:"Space"}',b=a+',{value:"spirit",label:"Spirit"}';
 const result=once(source,a,b); if(result.replace(b,a)!==source)throw Error('Unexpected diff');parseAst(result);return result;
}
function patchAnalytics(source,compiled){
 if(sha(source)!==ANALYTICS)throw Error('Production analytics drift');
 const marker='s.jsx("div",{className:"analytics-bars",children:H.map';
 const replacement='s.jsx(__SpiritAnalytics,{rows:H.map(p=>({name:p.name,value:p.orderSum})),onSelect:i=>C(H[i])}),'+marker;
 const append=`\nlet __spiritComponent;function __SpiritAnalytics(props){const[enabled,setEnabled]=d.useState(()=>document.documentElement.dataset.uiVariant==="spirit");d.useEffect(()=>{const root=document.documentElement;const observer=new MutationObserver(()=>setEnabled(root.dataset.uiVariant==="spirit"));observer.observe(root,{attributes:true,attributeFilter:["data-ui-variant"]});return()=>observer.disconnect()},[]);if(!enabled)return null;if(!__spiritComponent){const __spiritReact=d;${compiled}\n__spiritComponent=SpiritBuild.SpiritChart;}return s.jsx(__spiritComponent,props);}\n`;
 const output=once(source,marker,replacement)+append;parseAst(output);
 if(output.slice(0,-append.length).replace(replacement,marker)!==source)throw Error('Analytics calculations changed');
 return output;
}
async function main(){
 const [dir,out]=process.argv.slice(2);if(!out||fs.existsSync(out))throw Error('Specify snapshot and NEW output dir');
 const source=fs.readFileSync(path.join(dir,'current.js'),'utf8'),index=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 const built=await rv('esbuild').build({entryPoints:[path.join(web,'src/components/analytics/SpiritChart.tsx')],bundle:true,write:false,format:'iife',globalName:'SpiritBuild',minify:true,target:'es2020',jsx:'transform',jsxFactory:'__spiritReact.createElement',jsxFragment:'__spiritReact.Fragment',tsconfigRaw:{compilerOptions:{jsx:'react'}},plugins:[{name:'live-react',setup(b){
 b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'live'}));
 b.onLoad({filter:/.*/,namespace:'live'},()=>({contents:'export const useEffect=__spiritReact.useEffect,useRef=__spiritReact.useRef;',loader:'js'}));
 b.onResolve({filter:/spiritRenderer$/},()=>({path:'./spirit-renderer-20260928.js',external:true}));
 }}]});
 const renderer=await rv('esbuild').build({entryPoints:[path.join(web,'src/components/analytics/spiritRenderer.ts')],bundle:true,write:false,format:'esm',minify:true,target:'es2020'});
 const entry=index.match(/src="\/assets\/([^"/]+\.js)"/)[1],graph=new Map([[entry,source]]),pending=[entry];
 while(pending.length){const name=pending.pop();for(const m of graph.get(name).matchAll(/["']\.\/([^"']+\.js)["']/g)){const dep=m[1];if(!/^[\w.-]+\.js$/.test(dep))throw Error('Invalid asset');if(graph.has(dep))continue;const r=await fetch('https://wms.logoff.pro/assets/'+dep);if(!r.ok)throw Error('Missing '+dep);graph.set(dep,await r.text());pending.push(dep)}}
 const analytics=[...graph.keys()].find(n=>n.startsWith('AnalyticsPanel-'));if(!analytics)throw Error('No analytics chunk');
 const patched=new Map([[entry,patchMain(source)],[analytics,patchAnalytics(graph.get(analytics),built.outputFiles[0].text)]]);
 const names=Object.fromEntries([...graph.keys()].map(n=>[n,n===entry?'index-spirit-20260928.js':n.replace(/\.js$/,'-spirit20260928.js')]));
 const rewrite=s=>s.replace(/[\w.-]+\.js/g,n=>names[n]||n);
 fs.mkdirSync(out,{recursive:true});const files={};
 for(const [name,content] of graph){const next=rewrite(patched.get(name)||content);parseAst(next);fs.writeFileSync(path.join(out,names[name]),next);files[names[name]]={sha256:sha(next),original:name,originalSha256:sha(content)}}
 const rendererName='spirit-renderer-20260928.js',rendererText=renderer.outputFiles[0].text;parseAst(rendererText);
 fs.writeFileSync(path.join(out,rendererName),rendererText);files[rendererName]={sha256:sha(rendererText)};
 const css=fs.readFileSync(path.join(web,'src/components/layout/spirit-theme.css'),'utf8');fs.writeFileSync(path.join(out,'spirit-20260928.css'),css);
 const html=once(index,'/assets/'+entry,'/assets/'+names[entry]).replace('</head>','<link rel="stylesheet" href="/assets/spirit-20260928.css"></head>');fs.writeFileSync(path.join(out,'index.html'),html);
 fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify({baseSha:PIN,analyticsBaseSha:ANALYTICS,indexBeforeSha:sha(index),indexAfterSha:sha(html),cssSha:sha(css),files},null,2));
 console.log(JSON.stringify({chunks:graph.size,rendererBytes:rendererText.length,output:out}));
}
module.exports={patchMain,patchAnalytics,PIN,ANALYTICS};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
