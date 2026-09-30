const fs=require('fs'),path=require('path'),cp=require('child_process'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),out=process.argv[2];
const files=['modules/marketplace-connections/marketplace-connections.service','modules/marketplace-connections/ozon-fbs-pick-workflow','modules/stock/stock-operations.service'];
function compile(text){return ts.transpileModule(text.replace(/\r\n/g,'\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText;}
function methods(text){const a=ts.createSourceFile('s.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),r={};function walk(n){if(ts.isMethodDeclaration(n)||ts.isFunctionDeclaration(n)){if(n.name)r[n.name.getText(a)]=text.slice(n.getStart(a),n.end);}ts.forEachChild(n,walk);}walk(a);return r;}
const output=[];
for(const name of files){const p='wms/apps/api/src/'+name+'.ts';const old=compile(cp.execFileSync('git',['show','75f03380c3a864ae3a5fa8c4dac92250c78f3360:'+p],{cwd:path.dirname(root),encoding:'utf8',maxBuffer:20*1024*1024}));const fresh=compile(fs.readFileSync(path.join(root,'apps/api/src/'+name+'.ts'),'utf8'));const a=methods(old),b=methods(fresh);output.push({name,methods:Object.keys(b).filter(k=>a[k]!==b[k]).map(k=>({name:k,before:a[k]||null,after:b[k]}))});}
fs.writeFileSync(path.join(out,'method-deltas.json'),JSON.stringify(output));
for(const name of ['receipt-channel-policy','receipt-channels.controller'])fs.writeFileSync(path.join(out,'candidate-final/modules/warehouse/'+name+'.js'),compile(fs.readFileSync(path.join(root,'apps/api/src/modules/warehouse/'+name+'.ts'),'utf8')));
console.log(output.map(f=>({file:f.name,methods:f.methods.map(m=>m.name)})));


