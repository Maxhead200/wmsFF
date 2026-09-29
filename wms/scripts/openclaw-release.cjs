// FIX: overlay a verified live graph; preserve every unrelated published byte.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),rw=createRequire(path.join(root,'apps/web/package.json'));
const rv=createRequire(rw.resolve('vite/package.json')),{parseAst}=rv('rollup/parseAst'),esbuild=rv('esbuild');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function one(values,label){if(values.length!==1)throw Error('Ambiguous or missing '+label);return values[0]}
function walk(n,fn){if(!n||typeof n!=='object')return;fn(n);for(const [k,v]of Object.entries(n)){if(k==='parent')continue;if(Array.isArray(v))v.forEach(x=>walk(x,fn));else if(v&&typeof v==='object')walk(v,fn)}}
function apply(s,changes){for(const [a,b,v]of changes.sort((a,b)=>b[0]-a[0]))s=s.slice(0,a)+v+s.slice(b);parseAst(s);return s}
function patchEntry(s,bundle){
 if(s.includes('__wmsOpenClaw'))throw Error('Already patched');
 const n=one(parseAst(s).body.filter(n=>n.type==='FunctionDeclaration'&&s.slice(n.start,n.end).includes('wms-ai-hero')),'main AI component');
 const p=n.params[0];if(p?.type!=='ObjectPattern'||p.properties[0]?.key?.name!=='session')throw Error('AI session shape changed');
 const session=p.properties[0].value.name,legacy=s.slice(n.start,n.end).replace('function '+n.id.name+'(','function __wmsLegacyAI(');
 const replacement=`function ${n.id.name}({session:${session}}){return e.jsx(__wmsOpenClaw.Replacement,{session:${session},legacy:__wmsLegacyAI})}\n${legacy}`;
 return apply(s,[[n.start,n.end,replacement]])+'\n'+bundle+'\nexport {__wmsOpenClaw as openClawReplacement};\n';
}
function patchAdmin(s,entry){
 const ast=parseAst(s),help=one(ast.body.filter(n=>n.type==='FunctionDeclaration'&&s.slice(n.start,n.end).includes('Помощник не исполняет произвольный код')),'admin AI component');
 const calls=[];walk(ast,n=>{if(n.type==='CallExpression'&&n.arguments[0]?.name===help.id.name&&n.arguments[1]?.type==='ObjectExpression')calls.push(n)});
 const call=one(calls,'admin AI call'),parent=one(ast.body.filter(n=>n.type==='FunctionDeclaration'&&n.start<call.start&&n.end>call.end),'admin panel');
 const session=parent.params[0]?.properties?.find(p=>p.key?.name==='session')?.value?.name;if(session!=='s')throw Error('Admin session binding drift');
 const legacy=s.slice(help.start,help.end).replace('function '+help.id.name+'(','function __wmsLegacyAdminAI(');
 return `import {openClawReplacement as __wmsOpenClaw} from "./${entry}";\n`+apply(s,[[call.arguments[1].start+1,call.arguments[1].start+1,'session:'+session+','],[help.start,help.end,`function ${help.id.name}(props){return e.jsx(__wmsOpenClaw.Replacement,{session:props.session,legacy:__wmsLegacyAdminAI,legacyProps:props})}\n${legacy}`]]);
}
function patchApiRuntime(kind,s){
 const ast=parseAst(s),changes=[];
 if(kind==='registry'){
  const nodes=[];walk(ast,n=>{if(n.type==='ObjectExpression'&&n.properties.some(p=>p.key?.name==='id'&&p.value?.value==='wms-ai'))nodes.push(n)});
  const n=one(nodes,'wms-ai registry');
  for(const [key,value]of Object.entries({routeCount:'6',description:JSON.stringify('OpenClaw: задания владельца и администраторов с журналом результатов.'),logic:JSON.stringify(['При включённом OpenClaw прежний помощник отключён.','Повтор requestId не выполняет команду заново.','Доступ проверяется сервером по текущим правам пользователя.'])})){
   const p=one(n.properties.filter(p=>p.key?.name===key),'registry '+key);changes.push([p.value.start,p.value.end,value]);
  }
 }else if(kind==='admin'){
  const methods=[];walk(ast,n=>{if(n.type==='MethodDefinition'&&['assistantPreview','assistantApply'].includes(n.key?.name))methods.push(n)});
  if(methods.length!==2)throw Error('Admin assistant methods changed');
  for(const n of methods)changes.push([n.value.body.start+1,n.value.body.start+1,"\n        if (require('../wms-ai/wms-openclaw.service').openClawEnabled()) throw new common_1.ConflictException('ИИ заменён на OpenClaw. Обновите страницу.');\n"]);
 }else throw Error('Unknown runtime patch');
 return apply(s,changes);
}
function rewriteReferences(s,names){return s.replace(/[\w.-]+\.js/g,n=>names[n]||n)}
async function bundlePanel(){
 const built=await esbuild.build({stdin:{contents:`import {useState,useEffect} from 'react';import {jsx} from 'react/jsx-runtime';import {OpenClawPanel} from './apps/web/src/components/wms-ai/OpenClawPanel';import {fetchOpenClawStatus} from './apps/web/src/lib/openclaw-api';export function Replacement({session,legacy:Legacy,legacyProps}){const [status,setStatus]=useState(null),[error,setError]=useState('');useEffect(()=>{let active=true;fetchOpenClawStatus(session.accessToken).then(v=>{if(active)setStatus(v)}).catch(err=>{if(active)setError(err.message)});return()=>{active=false}},[session.accessToken]);if(error)return jsx('div',{className:'wms-ai-error',children:error});if(!status)return jsx('div',{children:'Проверяю подключение ИИ…'});return status.enabled?jsx(OpenClawPanel,{session,allowed:status.allowed}):jsx(Legacy,legacyProps||{session})}`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',globalName:'__wmsOpenClaw',jsx:'automatic',define:{'import.meta.env.VITE_API_URL':'"/api/v1"'},plugins:[{name:'live-react',setup(b){b.onResolve({filter:/^react(?:\/jsx-runtime)?$/},a=>({path:a.path,namespace:'live-react'}));b.onLoad({filter:/.*/,namespace:'live-react'},a=>({contents:a.path==='react'?`export const useState=(...args)=>x.useState(...args);export const useEffect=(...args)=>x.useEffect(...args);`:`export const jsx=(...args)=>e.jsx(...args);export const jsxs=(...args)=>e.jsxs(...args);`,loader:'js'}))}}]});return built.outputFiles[0].text;
}
async function buildWeb(input,out){
 const index=fs.readFileSync(path.join(input,'index.html'),'utf8'),entry=one([...index.matchAll(/src="\/assets\/([^"/]+\.js)"/g)].map(m=>m[1]).filter(n=>!n.startsWith('spirit-tilt')),'entry');
 const graph=new Map(),pending=[entry];while(pending.length){const n=pending.pop();if(graph.has(n))continue;if(!/^[\w.-]+\.js$/.test(n))throw Error('Invalid filename');const s=fs.readFileSync(path.join(input,n),'utf8');graph.set(n,s);for(const m of s.matchAll(/["']\.\/([^"']+\.js)["']/g))if(!graph.has(m[1]))pending.push(m[1]);}
 const admin=one([...graph.keys()].filter(n=>graph.get(n).includes('Помощник не исполняет произвольный код')),'admin chunk');
 const names=Object.fromEntries([...graph.keys()].map((n,i)=>[n,`openclaw-20260928-${i}.js`])),reverse=Object.fromEntries(Object.entries(names).map(([a,b])=>[b,a]));
 fs.mkdirSync(out,{recursive:false});const files={};
 for(const [n,original]of graph){let expected=n===entry?patchEntry(original,await bundlePanel()):n===admin?patchAdmin(original,entry):original,next=rewriteReferences(expected,names);if(rewriteReferences(next,reverse)!==expected)throw Error('Irreversible references');parseAst(next);fs.writeFileSync(path.join(out,names[n]),next);files[names[n]]={sha256:sha(next),original:n,originalSha256:sha(original),patched:n===entry||n===admin};}
 const html=index.replace('/assets/'+entry,'/assets/'+names[entry]);fs.writeFileSync(path.join(out,'index.html'),html);fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify({indexBeforeSha:sha(index),indexAfterSha:sha(html),files,entry:names[entry],admin:names[admin]},null,2));return {chunks:graph.size,entry,admin};
}
function buildApi(sourceFile,runtimeFile,out){
 const sources=JSON.parse(fs.readFileSync(sourceFile)),runtime=JSON.parse(fs.readFileSync(runtimeFile)),api=path.join(root,'apps/api');
 const cfg=ts.readConfigFile(api+'/tsconfig.json',ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(cfg.config,ts.sys,api);
 function program(live){const host=ts.createCompilerHost(parsed.options),read=host.readFile;host.readFile=p=>{const rel=path.relative(api+'/src',p).replaceAll('\\','/');return live&&sources[rel]?.exists?Buffer.from(sources[rel].textB64,'base64').toString():read(p)};return ts.createProgram(parsed.fileNames,parsed.options,host)}
 const old=program(true);for(const n of ['modules/wms-ai/wms-ai.controller.ts','modules/wms-ai/wms-ai.module.ts'])old.emit(old.getSourceFile(api+'/src/'+n),(p,text)=>{if(p.endsWith('.js')&&text!==Buffer.from(runtime[n.replace(/\.ts$/,'.js')],'base64').toString())throw Error('Source/runtime parity changed: '+n)});
 const current=program(false),files={};fs.mkdirSync(out,{recursive:false});
 for(const n of ['modules/wms-ai/wms-ai.controller.ts','modules/wms-ai/wms-ai.module.ts','modules/wms-ai/wms-openclaw.service.ts','modules/wms-ai/dto/wms-openclaw-job.dto.ts'])current.emit(current.getSourceFile(api+'/src/'+n),(p,text)=>{if(p.endsWith('.js'))files[n.replace(/\.ts$/,'.js')]=text});
 for(const [n,kind]of [['modules/administration/administration.controller.js','admin'],['modules/administration/administration-internal-api.service.js','registry']])files[n]=patchApiRuntime(kind,Buffer.from(runtime[n],'base64').toString());
 const proof={};for(const [n,text]of Object.entries(files)){parseAst(text);const p=path.join(out,n);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);proof[n]=sha(text)}fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify(proof,null,2));return Object.keys(proof);
}
module.exports={patchEntry,patchAdmin,patchApiRuntime,rewriteReferences,buildWeb,buildApi,bundlePanel};
if(require.main===module)(async()=>{const [mode,...args]=process.argv.slice(2);console.log(JSON.stringify(mode==='web'?await buildWeb(...args):buildApi(...args)))})().catch(e=>{console.error(e);process.exitCode=1});
