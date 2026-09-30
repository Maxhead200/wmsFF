const fs=require('fs'),path=require('path'),esbuild=require(process.env.ESBUILD_MODULE || 'esbuild');
// FIX: overlay only the captured module graph; never replace production with a full source build.
const root=path.resolve(process.argv[2]),repo=path.resolve(__dirname,'..'),before=path.join(root,'before-web'),out=path.join(root,'web');
const old='payroll-compact-20260929',fresh='panthera-windows-20260930';
let source=fs.readFileSync(path.join(repo,'apps/web/src/components/layout/PantheraWorkspaces.tsx'),'utf8').replace(/^import .*;\r?\n/gm,'');
source='const React=x;const {useEffect,useRef,useState}=x;const createPortal=ws.createPortal;\n'+source;
const compiled=esbuild.buildSync({stdin:{contents:source,loader:'tsx'},bundle:true,write:false,format:'iife',globalName:'__PantheraWindows',minify:true,jsxFactory:'React.createElement',jsxFragment:'React.Fragment'}).outputFiles[0].text;
function replaceOnce(text,a,b){if(text.split(a).length!==2)throw Error('Anchor not unique: '+a.slice(0,80));return text.replace(a,b)}
const names=fs.readdirSync(path.join(before,'assets')).filter(n=>new RegExp('^'+old+'-\\d+\\.js$').test(n)); if(names.length!==29)throw Error('Unexpected module graph '+names.length);
const output={};
for(const name of names){let s=fs.readFileSync(path.join(before,'assets',name),'utf8');
 if(name===old+'-0.js'){
  const call='J5(se.id,t,G,v,m,b,S,q,ne=>{$(ne),v("requests")},()=>$(null),d,l)';
  s=replaceOnce(s,'):'+call+'}),e.jsx(nO','):m==="la_panthera"?e.jsx(__PantheraWindows.PantheraWorkspaces,{activeId:se.id,onOpen:v,render:id=>'+call.replace('se.id,','id,')+'},t.user.id+":"+t.user.activeWarehouseId):'+call+'}),e.jsx(nO');
  s+='\n'+compiled;
 }
 if(name===old+'-16.js')s=replaceOnce(s,'className:`fbs-tiles${a==="WILDBERRIES"?" fbs-tiles--wb":""}`,role:', 'className:`fbs-tiles${a==="WILDBERRIES"?" fbs-tiles--wb":""}`,"data-marketplace":a,role:');
 for(const n of names)s=s.split(n).join(n.replace(old,fresh));
 output['assets/'+name.replace(old,fresh)]=s;
}

let index=fs.readFileSync(path.join(before,'index.html'),'utf8');index=replaceOnce(index,old+'-0.js',fresh+'-0.js');
// Preserve the comment opener removed by extracting only the new tile rules.
output['assets/'+fresh+'.css']=fs.readFileSync(path.join(repo,'apps/web/src/components/layout/panthera-windows.css'),'utf8')+'\n/* FIX: la_panthera WB menu:'+fs.readFileSync(path.join(repo,'apps/web/src/components/fbs/fbs.css'),'utf8').split('/* FIX: la_panthera WB menu:')[1];
output['index.html']=index.replace('</head>','<link rel="stylesheet" href="/assets/'+fresh+'.css"></head>');
for(const[n,s]of Object.entries(output)){const p=path.join(out,n);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);}
fs.writeFileSync(path.join(root,'delta.json'),JSON.stringify(Object.keys(output),null,2));console.log('Built',Object.keys(output).length,'files');
