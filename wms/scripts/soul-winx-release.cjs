// FIX: pinned Soul-only adapter/CSS update plus immutable generated wallpaper.
const {build}=require('./soul-release.cjs'),{createHash}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const sha=data=>createHash('sha256').update(data).digest('hex');
function patch(source,compiled){
 if(sha(source)!=='07bff1e5c1e703dcbf651db8a91d200485f3d6340eddf981d429cf1bc329301a')throw Error('Production entry drift');
 const marker='\nlet __soulComponent;function __SoulWorkspace(props){if(!__soulComponent){const __SoulReact=x;';
 const suffix='\n__soulComponent=SoulBuild.SoulWorkspace;}return e.jsx(__soulComponent,props);}\n';
 const parts=source.split(marker);if(parts.length!==2||!parts[1].endsWith(suffix))throw Error('Unknown adapter');
 return parts[0]+marker+compiled+suffix;
}
async function release(out){
 await build(out,patch,'soul-winx-20260929');
 const name='soul-winx-20260929.png',bytes=fs.readFileSync(path.resolve(__dirname,'../apps/web/public/assets',name));
 fs.writeFileSync(path.join(out,name),bytes);
 const proofPath=path.join(out,'proof.json'),proof=JSON.parse(fs.readFileSync(proofPath,'utf8'));
 proof.files[name]={sha256:sha(bytes)};fs.writeFileSync(proofPath,JSON.stringify(proof,null,2));
}
module.exports={patch};
if(require.main===module)release(process.argv[2]).catch(e=>{console.error(e);process.exitCode=1;});
