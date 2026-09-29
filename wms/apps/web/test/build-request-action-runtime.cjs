// FIX: wrap only the verified table's returned elements; never replace the legacy runtime module.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const web=path.resolve(__dirname,'..'),req=createRequire(path.join(web,'package.json')),vite=createRequire(req.resolve('vite/package.json'));
const ts=req('typescript'),root=process.argv[2],input=path.join(root,'web/assets/'+(process.argv[3]||'light-style-20260929-6.js'));
const source=fs.readFileSync(input,'utf8'),sf=ts.createSourceFile(input,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const table=sf.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='ui');
const returned=table.body.statements.find(ts.isReturnStatement).expression;
if(!table.getText(sf).includes('onUploadManualInstruction:Q,onEmergencyPackedXlsx:de,onRollbackEmergencyClose:F'))throw Error('Runtime signature changed');
const built=vite('esbuild').buildSync({entryPoints:[path.join(web,'src/components/client-requests/requestActionRuntime.tsx')],bundle:true,write:false,format:'esm',external:['react/jsx-runtime']}).outputFiles[0].text;
const adapter=built.replace('import { jsx } from "react/jsx-runtime";','const {jsx}=e;').replace(/export\s*\{\s*groupRuntimeRequestActions\s*\};/,'return groupRuntimeRequestActions;');
if(/import |export \{/.test(adapter))throw Error('Unbound runtime imports');
// FIX: replace an existing adapter without touching its table or other runtime code.
const existing=sf.statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(sf)==='__RequestActionMenus'));
const replacement='const __RequestActionMenus=(()=>{'+adapter+'})();';
let patched=existing?source.slice(0,existing.getStart(sf))+replacement+source.slice(existing.end):replacement+'\n'+source.slice(0,returned.getStart(sf))+'__RequestActionMenus('+returned.getText(sf)+',!!(Q||de||F))'+source.slice(returned.end);
fs.writeFileSync(path.join(root,'patched-requests.js'),patched);
fs.writeFileSync(path.join(root,'table-patch-proof.json'),JSON.stringify({passed:true,table:'ui',returnStart:returned.getStart(sf),returnEnd:returned.end,adapterOnly:true}));
