// FIX: additive release from the pinned live bundle, not a stale full rebuild.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const web=path.resolve(__dirname,'../apps/web');
const requireWeb=createRequire(path.join(web,'package.json'));
const requireVite=createRequire(requireWeb.resolve('vite/package.json'));
const {parseAst}=requireVite('rollup/parseAst');
const PIN='f4360058073e57a06af6872f069d8be9ad5ae88e059b26ddf3dff5564c9b8090';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function once(s,needle,value){if(s.split(needle).length!==2)throw Error('Expected exactly one marker: '+needle);return s.replace(needle,value)}
function patch(source,compiled){
 if(sha(source)!==PIN)throw Error('Published bundle drift');
 const ast=parseAst(source);const functionText=name=>{const n=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);if(!n)throw Error('Missing '+name);return {node:n,text:source.slice(n.start,n.end)}};
 if(!functionText('Ij').text.includes('/client-requests')||!functionText('VI').text.includes('/stock/fulfillment/waves'))throw Error('Read-only API bindings drift');
 const ops=functionText('p5'),menu=functionText('m5');
 let newOps=once(ops.text,'r==="statistics"?e.jsx(n2,{session:n}):null,','r==="statistics"?e.jsx(n2,{session:n}):null,r==="waves"&&window.location.hostname==="wms.logoff.pro"?e.jsx(__LogoffWaveReadOnly,{session:n}):null,');
 newOps=once(newOps,'e.jsx(X8,{session:n})','window.location.hostname!=="wms.logoff.pro"?e.jsx(X8,{session:n}):null');
 const newMenu=once(menu.text,'const n=[','const n=[...(window.location.hostname==="wms.logoff.pro"?[{id:"waves",eyebrow:"Планирование сборки",title:"Волны сборки",description:"Заявки FBS и существующие волны. Пока только просмотр.",icon:e.jsx(Bj,{size:23})}]:[]),');
 let output=source;for(const entry of [{...ops,replacement:newOps},{...menu,replacement:newMenu}].sort((a,b)=>b.node.start-a.node.start))output=output.slice(0,entry.node.start)+entry.replacement+output.slice(entry.node.end);
 // FIX: use the published React and authenticated GET helpers; never bundle a second React.
 const injection=`\nlet __waveComponent;function __LogoffWaveReadOnly(props){if(!__waveComponent){const __waveReact=x;${compiled}\n__waveComponent=WaveReadOnlyBuild.WaveOverviewPanel;}return e.jsx(__waveComponent,props);}\n`;
 output+=injection;parseAst(output);
 const restored=output.slice(0,-injection.length).replace(newOps,ops.text).replace(newMenu,menu.text);
 if(restored!==source)throw Error('Unexpected operational code changed');
 return {output,proof:{baseSha:PIN,changedFunctions:['p5','m5'],unchangedRemainderSha:sha(restored),newComponentSha:sha(compiled)}};
}
async function main(){
 const [input,indexFile,out]=process.argv.slice(2);if(!out||fs.existsSync(out))throw Error('Usage: pinned-bundle index new-output-dir');
 const reactNames='useState useEffect useMemo'.split(' ');
 const built=await requireVite('esbuild').build({entryPoints:[path.join(web,'src/components/warehouse/WaveOverviewPanel.tsx')],bundle:true,write:false,outfile:'waves.js',format:'iife',globalName:'WaveReadOnlyBuild',minify:true,target:'es2020',jsx:'transform',jsxFactory:'__waveReact.createElement',jsxFragment:'__waveReact.Fragment',tsconfigRaw:{compilerOptions:{jsx:'react'}},plugins:[{name:'published-bindings',setup(b){
 b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'live'}));
 b.onResolve({filter:/\/lib\/api$/},()=>({path:'api',namespace:'live'}));
 b.onLoad({filter:/.*/,namespace:'live'},args=>({loader:'js',contents:args.path==='api'?'export const fetchClientRequests=Ij;export const fetchPickWaves=VI;':reactNames.map(n=>`export const ${n}=__waveReact.${n};`).join('\n')+'\nexport default __waveReact;'}));
 }}]});
 const compiled=built.outputFiles.find(f=>f.path.endsWith('.js')).text;
 const css=built.outputFiles.find(f=>f.path.endsWith('.css')).text;
 const source=fs.readFileSync(input,'utf8'),index=fs.readFileSync(indexFile,'utf8');
 const {output,proof}=patch(source,compiled);
 const entry=index.match(/src="\/assets\/([^"/]+\.js)"/)?.[1];if(!entry)throw Error('Missing current entry');
 // FIX: copy and version every reachable JS chunk to retain a single module graph.
 const graph=new Map([[entry,source]]),pending=[entry];
 while(pending.length){const name=pending.pop();for(const match of graph.get(name).matchAll(/["']\.\/([^"']+\.js)["']/g)){const dep=match[1];if(!/^[\w.-]+\.js$/.test(dep))throw Error('Unsafe asset name');if(graph.has(dep))continue;const response=await fetch('https://wms.logoff.pro/assets/'+dep);if(!response.ok)throw Error('Cannot read '+dep);graph.set(dep,await response.text());pending.push(dep)}}
 const names=Object.fromEntries([...graph.keys()].map(n=>[n,n===entry?'index-waves-readonly-20260927.js':n.replace(/\.js$/,'-wavesro20260927.js')]));
 const rewrite=s=>s.replace(/[\w.-]+\.js/g,n=>names[n]||n);
 fs.mkdirSync(out,{recursive:true});const files={};
 for(const [name,content]of graph){const next=rewrite(name===entry?output:content);parseAst(next);fs.writeFileSync(path.join(out,names[name]),next);files[names[name]]={sha256:sha(next),original:name,originalSha256:sha(content)}}
 fs.writeFileSync(path.join(out,'waves-readonly-20260927.css'),css);
 const newIndex=once(index,'/assets/'+entry,'/assets/'+names[entry]).replace('</head>','<link rel="stylesheet" href="/assets/waves-readonly-20260927.css"></head>');
 fs.writeFileSync(path.join(out,'index.html'),newIndex);
 fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify({...proof,indexBeforeSha:sha(index),indexAfterSha:sha(newIndex),cssSha:sha(css),files},null,2));
 console.log(JSON.stringify({functions:proof.changedFunctions,chunks:graph.size,entry:names[entry]}));
}
module.exports={patch,once,PIN};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
