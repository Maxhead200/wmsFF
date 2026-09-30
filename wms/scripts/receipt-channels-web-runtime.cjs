const fs=require('fs'),path=require('path'),crypto=require('crypto'),esbuild=require(process.env.ESBUILD_MODULE||'esbuild');
const root=path.resolve(process.argv[2]),repo=path.resolve(__dirname,'..'),before=path.join(root,'before-web'),out=path.join(root,'web');
const captured=JSON.parse(fs.readFileSync(path.join(root,'before.json'),'utf8')),old='panthera-multi-20260930',fresh='receipt-channels-20260930';
function read(n){const b=fs.readFileSync(path.join(before,n));if(crypto.createHash('sha256').update(b).digest('hex')!==captured.web[n])throw Error('Capture mismatch '+n);return b.toString('utf8');}
let source=fs.readFileSync(path.join(repo,'apps/web/src/components/warehouse/ReceiptDirectionsPanel.tsx'),'utf8').replace(/^import .*;\r?\n/gm,'');
const compiled=esbuild.buildSync({stdin:{contents:'const React=x;const {useEffect,useRef,useState}=x;\n'+source,loader:'tsx'},bundle:true,write:false,format:'iife',globalName:'__ReceiptDirections',minify:true,jsxFactory:'React.createElement',jsxFragment:'React.Fragment'}).outputFiles[0].text;
const names=Object.keys(captured.web).filter(n=>new RegExp('^assets/'+old+'-\\d+\\.js$').test(n));if(names.length!==29)throw Error('Unexpected chunk graph');
const output={};for(const name of names){let s=read(name);if(name.endsWith('-0.js')){
 const one='className:"receipt-batches",children:[',two='className:`online-receipts ${n?"online-receipts--readonly":""}`,children:[';
 if(s.split(one).length!==2||s.split(two).length!==2)throw Error('Receipt anchors changed');
 s=s.replace(one,one+'i?e.jsx(__ReceiptDirections.ReceiptDirectionsPanel,{session:n,fixedClientId:i},i):null,');
 s=s.replace(two,two+'!n&&l?e.jsxs("details",{children:[e.jsx("summary",{children:"Направления приёмок ФБС / ФБО"}),e.jsx(__ReceiptDirections.ReceiptDirectionsPanel,{session:s,fixedClientId:l},l)]}):null,');
 s=s.split('Файлы приёмки').join('Приёмки').split('Файлы приемки').join('Приёмки');s+='\n'+compiled;
 }
 for(const n of names)s=s.split(path.posix.basename(n)).join(path.posix.basename(n).replace(old,fresh));output[name.replace(old,fresh)]=s;
}
output['assets/'+fresh+'.css']='.receipt-directions table{width:100%;border-collapse:collapse}.receipt-directions th,.receipt-directions td{padding:12px;text-align:left;border-bottom:1px solid var(--border-color,#dce2ec)}.receipt-directions input[type=checkbox]{width:22px;height:22px;accent-color:#da1020}.receipt-directions label{display:grid;gap:6px}.receipt-directions button{padding:10px 14px;margin:4px}.receipt-directions details{margin:6px 0}.receipt-directions td strong{overflow-wrap:anywhere}.receipt-directions p{line-height:1.5}';
let index=read('index.html');const anchor='src="/assets/'+old+'-0.js"';if(!index.includes(anchor))throw Error('Entry changed');output['index.html']=index.replace(anchor,'src="/assets/'+fresh+'-0.js"').replace('</head>','<link rel="stylesheet" href="/assets/'+fresh+'.css"></head>');
for(const[n,s]of Object.entries(output)){const p=path.join(out,n);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);}fs.writeFileSync(path.join(root,'delta.json'),JSON.stringify(Object.keys(output),null,2));console.log('Built scoped web delta',Object.keys(output).length);

