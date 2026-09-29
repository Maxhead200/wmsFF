// FIX: replace only the pinned Soul adapter; preserve every production page.
const {build}=require('./soul-release.cjs'),{createHash}=require('node:crypto');
const PIN='3085944b71ce0c5ffb35d64a6821ad8d9172312a72746ce4c892ececf26448ae';
function patch(source,compiled){
 if(createHash('sha256').update(source).digest('hex')!==PIN)throw Error('Production entry drift');
 const marker='\nlet __soulComponent;function __SoulWorkspace(props){if(!__soulComponent){const __SoulReact=x;';
 const suffix='\n__soulComponent=SoulBuild.SoulWorkspace;}return e.jsx(__soulComponent,props);}\n';
 const parts=source.split(marker);if(parts.length!==2||!parts[1].endsWith(suffix))throw Error('Unknown adapter');
 return parts[0]+marker+compiled+suffix;
}
module.exports={patch};
if(require.main===module)build(process.argv[2],patch,'soul-quick-20260929').catch(e=>{console.error(e);process.exitCode=1;});
