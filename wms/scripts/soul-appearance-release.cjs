// FIX: replace only the pinned Soul adapter, preserving the live application.
const {build}=require('./soul-release.cjs'),{createHash}=require('node:crypto');
function patchAppearance(source,compiled){
 if(createHash('sha256').update(source).digest('hex')!=='6700ef25f82f9eb6355f48036c2563eadee12ab1c83cc55c0cb2f7e6687a53e8')throw Error('Production entry drift');
 const marker='\nlet __soulComponent;function __SoulWorkspace(props){if(!__soulComponent){const __SoulReact=x;';
 const parts=source.split(marker);if(parts.length!==2||!parts[1].endsWith('\n__soulComponent=SoulBuild.SoulWorkspace;}return e.jsx(__soulComponent,props);}\n'))throw Error('Unknown adapter');
 const old='e.jsx(__SoulWorkspace,{groups:A,activeId:se.id,onOpen:v,children:';
 if(parts[0].split(old).length!==2)throw Error('Unknown Soul call');
 return parts[0].replace(old,'e.jsx(__SoulWorkspace,{userId:t.user.id,groups:A,activeId:se.id,onOpen:v,children:')+marker+compiled+'\n__soulComponent=SoulBuild.SoulWorkspace;}return e.jsx(__soulComponent,props);}\n';
}
module.exports={patchAppearance};
if(require.main===module)build(process.argv[2],patchAppearance,'soul-appearance-20260929').catch(e=>{console.error(e);process.exitCode=1;});
