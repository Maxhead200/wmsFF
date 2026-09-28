// FIX: CSS-only additive release against the current live index, never a stale app build.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const name='spirit-cambria-20260928.css';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function patch(index){
 const old='/assets/spirit-readable-times-20260928.css',next='/assets/'+name;
 if(index.split(old).length!==2||index.includes(next))throw Error('Index drift');
 return index.replace(old,next);
}
async function main(){
 const out=process.argv[2];if(!out||fs.existsSync(out))throw Error('New output required');
 const response=await fetch('https://wms.logoff.pro/');if(!response.ok)throw Error('Fetch failed');
 const index=await response.text(),next=patch(index);
 const base=path.resolve(__dirname,'../apps/web/src/components/layout');
 const css=fs.readFileSync(path.join(base,'spirit-theme.css'),'utf8')+'\n'+fs.readFileSync(path.join(base,'tile-motion.css'),'utf8');
 fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'index.html'),next);
 fs.writeFileSync(path.join(out,name),css);
 fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify({indexBeforeSha:sha(index),indexAfterSha:sha(next),cssName:name,cssSha:sha(css),files:{}},null,2));
 console.log(JSON.stringify({css:name,bytes:Buffer.byteLength(css),sha:sha(css)}));
}
module.exports={patch};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
