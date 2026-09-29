// FIX: overlay only OpenClaw history onto verified deployed API/web bytes.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), ts = require('typescript');
const {createRequire} = require('node:module');
const root = path.resolve(__dirname, '..'), rw = createRequire(path.join(root, 'apps/web/package.json'));
const {parseAst} = createRequire(rw.resolve('vite/package.json'))('rollup/parseAst');
const {bundlePanel} = require('./openclaw-release.cjs');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function one(values,label){if(values.length!==1)throw Error('Missing or ambiguous '+label);return values[0]}
function method(source,name){
 const ast=ts.createSourceFile('runtime.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),found=[];
 function visit(node){if(ts.isMethodDeclaration(node)&&node.name?.getText(ast)===name)found.push(node);ts.forEachChild(node,visit)}visit(ast);
 const node=one(found,name);return {start:node.getStart(ast),end:node.end,text:node.getText(ast)};
}
function emitted(file){return ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText}
function patchService(live){
 if(live.includes('listJobs(user, cursor)'))throw Error('History service already installed');
 const old=method(live,'get'),fresh=method(emitted('apps/api/src/modules/wms-ai/wms-openclaw.service.ts'),'listJobs');
 const next=live.slice(0,old.end)+'\n    '+fresh.text+live.slice(old.end);
 new Function(next);return next;
}
function patchController(live){
 if(live.includes('openClawJobs(user, cursor)'))throw Error('History controller already installed');
 const compiled=emitted('apps/api/src/modules/wms-ai/wms-ai.controller.ts');
 const old=method(live,'openClawSubmit'),fresh=method(compiled,'openClawJobs');
 let next=live.slice(0,old.end)+'\n    '+fresh.text+live.slice(old.end);
 const tail='WmsAiController.prototype, "openClawJobs", null);';
 const end=compiled.indexOf(tail);if(end<0)throw Error('Missing compiled history route decorators');
 const start=compiled.lastIndexOf('__decorate([',end),decorators=compiled.slice(start,end+tail.length);
 const classDecoration='exports.WmsAiController = WmsAiController = __decorate([';
 const pos=next.indexOf(classDecoration);if(pos<0||next.indexOf(classDecoration,pos+1)>=0)throw Error('Controller class decoration changed');
 next=next.slice(0,pos)+decorators+'\n'+next.slice(pos);
 new Function(next);return next;
}
async function patchWeb(live){
 const ast=parseAst(live),old=one(ast.body.filter(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='__wmsOpenClaw')),'OpenClaw bundle');
 const fresh=(await bundlePanel()).trim();
 if(!fresh.startsWith('var __wmsOpenClaw ='))throw Error('Compiled panel shape changed');
 const next=live.slice(0,old.start)+fresh+live.slice(old.end);parseAst(next);return next;
}
function historyCss(){
 const css=fs.readFileSync(path.join(root,'apps/web/src/components/wms-ai/wms-ai.css'),'utf8');
 const start=css.indexOf('/* FIX: server-backed OpenClaw conversations'),end=css.indexOf('.wms-ai-chat__status',start);
 if(start<0||end<0||end<=start)throw Error('History styles missing');
 return css.slice(start,end).trim()+'\n';
}
function patchIndex(live){
 const link='<link rel="stylesheet" href="/assets/openclaw-history-20260929.css">';
 if(live.includes(link))throw Error('History stylesheet already installed');
 if(live.split('</head>').length!==2)throw Error('Web index changed');
 return live.replace('</head>',link+'</head>');
}
function patchRegistry(live){
 const ast=parseAst(live),matches=[];
 function visit(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='ObjectExpression'&&node.properties?.some(p=>p.key?.name==='id'&&p.value?.value==='wms-ai'))matches.push(node);
  for(const [key,value] of Object.entries(node)){
   if(key==='parent')continue;
   if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
  }
 }
 visit(ast);
 const group=one(matches,'wms-ai API registry');
 const count=one(group.properties.filter(p=>p.key?.name==='routeCount'),'wms-ai route count');
 if(count.value.value!==6)throw Error('Existing wms-ai route count changed');
 const next=live.slice(0,count.value.start)+'7'+live.slice(count.value.end);
 parseAst(next);return next;
}
async function build(baseline,target){
 const manifest=JSON.parse(fs.readFileSync(path.join(baseline,'manifest.json'),'utf8'));
 for(const [name,expected] of Object.entries(manifest.files))if(hash(fs.readFileSync(path.join(baseline,name)))!==expected)throw Error('Baseline hash changed: '+name);
 if(fs.existsSync(target))throw Error('Destination already exists');
 const files={
  'api-service.js':patchService(fs.readFileSync(path.join(baseline,'api-service.js'),'utf8')),
  'api-controller.js':patchController(fs.readFileSync(path.join(baseline,'api-controller.js'),'utf8')),
  'api-registry.js':patchRegistry(fs.readFileSync(path.join(baseline,'api-registry.js'),'utf8')),
  'web-openclaw.js':await patchWeb(fs.readFileSync(path.join(baseline,'web-openclaw.js'),'utf8')),
  'web-index.html':patchIndex(fs.readFileSync(path.join(baseline,'web-index.html'),'utf8')),
  'openclaw-history-20260929.css':historyCss(),
 };
 fs.mkdirSync(target,{recursive:true});for(const [name,content] of Object.entries(files))fs.writeFileSync(path.join(target,name),content);
 fs.writeFileSync(path.join(target,'proof.json'),JSON.stringify({baseImages:manifest.images,changes:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,hash(v)]))},null,2));
 return Object.keys(files);
}
module.exports={patchService,patchController,patchRegistry,patchWeb,patchIndex,historyCss,build};
if(require.main===module)build(process.argv[2],process.argv[3]).then(files=>console.log(JSON.stringify(files))).catch(error=>{console.error(error.message);process.exitCode=1});
