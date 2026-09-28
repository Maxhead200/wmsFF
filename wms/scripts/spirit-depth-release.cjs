// FIX: CSS-only release preserving the current application's exact entry point.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function patch(index){const old='/assets/spirit-warm-20260928.css';if(index.split(old).length!==2)throw Error('Spirit CSS drift');return index.replace(old,'/assets/spirit-depth-20260928.css')}
async function main(){const out=process.argv[2];if(!out||fs.existsSync(out))throw Error('New output required');
 const response=await fetch('https://wms.logoff.pro/');if(!response.ok)throw Error('Fetch failed');
 const index=await response.text(),next=patch(index);
 const css=fs.readFileSync(path.join(__dirname,'../apps/web/src/components/layout/spirit-theme.css'),'utf8');
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'index.html'),next);fs.writeFileSync(path.join(out,'spirit-depth-20260928.css'),css);
 fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify({indexBeforeSha:sha(index),indexAfterSha:sha(next),cssName:'spirit-depth-20260928.css',cssSha:sha(css),files:{}},null,2));
}
module.exports={patch};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
