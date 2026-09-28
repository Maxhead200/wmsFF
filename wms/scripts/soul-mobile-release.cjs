// FIX: additive CSS-only release; keep every published script unchanged.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const sha=s=>createHash('sha256').update(s).digest('hex');
async function build(out){
 if(!out||fs.existsSync(out))throw Error('New output directory required');
 const response=await fetch('https://wms.logoff.pro/');if(!response.ok)throw Error('Index unavailable');
 const index=await response.text(),cssName='soul-mobile-20260929.css';
 if(index.split('</head>').length!==2||index.includes(cssName))throw Error('Unexpected index');
 const css=fs.readFileSync(path.join(__dirname,'../apps/web/src/components/layout/soul-theme.css'),'utf8');
 const html=index.replace('</head>',`<link rel="stylesheet" href="/assets/${cssName}"></head>`);
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,cssName),css);fs.writeFileSync(path.join(out,'index.html'),html);
 fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify({indexBeforeSha:sha(index),indexAfterSha:sha(html),cssName,cssSha:sha(css),files:{}},null,2));
}
build(process.argv[2]).catch(e=>{console.error(e);process.exitCode=1;});
