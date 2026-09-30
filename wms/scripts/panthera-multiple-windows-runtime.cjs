const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),esbuild=require(process.env.ESBUILD_MODULE||'esbuild');
// FIX: update only the captured window component, retaining the existing application and one React graph.
const root=path.resolve(process.argv[2]),repo=path.resolve(__dirname,'..'),before=path.join(root,'before-web'),out=path.join(root,'web');
const old='panthera-windows-20260930',fresh='panthera-multi-20260930';
const captured=JSON.parse(fs.readFileSync(path.join(root,'before.json'),'utf8'));
function read(n){const bytes=fs.readFileSync(path.join(before,n));if(crypto.createHash('sha256').update(bytes).digest('hex')!==captured.web[n])throw Error('Capture mismatch '+n);return bytes.toString('utf8')}
let source=fs.readFileSync(path.join(repo,'apps/web/src/components/layout/PantheraWorkspaces.tsx'),'utf8').replace(/^import .*;\r?\n/gm,'');
source='const React=x;const {useEffect,useRef,useState}=x;const createPortal=ws.createPortal;\n'+source;
const compiled=esbuild.buildSync({stdin:{contents:source,loader:'tsx'},bundle:true,write:false,format:'iife',globalName:'__PantheraWindows',minify:true,jsxFactory:'React.createElement',jsxFragment:'React.Fragment'}).outputFiles[0].text;
const names=Object.keys(captured.web).filter(n=>new RegExp('^assets/'+old+'-\\d+\\.js$').test(n));if(names.length!==29)throw Error('Unexpected graph');
const output={};for(const name of names){let s=read(name);if(name.endsWith('-0.js')){const start=s.lastIndexOf('var __PantheraWindows=');if(start<0)throw Error('Missing window component');s=s.slice(0,start)+compiled;}for(const n of names)s=s.split(path.posix.basename(n)).join(path.posix.basename(n).replace(old,fresh));output[name.replace(old,fresh)]=s;}
let index=read('index.html');if(!index.includes('src="/assets/'+old+'-0.js"'))throw Error('Entry changed');index=index.replace('src="/assets/'+old+'-0.js"','src="/assets/'+fresh+'-0.js"');
output['assets/'+fresh+'.css']=fs.readFileSync(path.join(repo,'apps/web/src/components/layout/panthera-windows.css'),'utf8');output['index.html']=index.replace('</head>','<link rel="stylesheet" href="/assets/'+fresh+'.css"></head>');
for(const[n,s]of Object.entries(output)){const p=path.join(out,n);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);}fs.writeFileSync(path.join(root,'delta.json'),JSON.stringify(Object.keys(output),null,2));console.log('Built',Object.keys(output).length,'files');
