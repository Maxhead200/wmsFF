// FIX: pin the live entry; change navigation and Soul only, never rebuild stale pages.
const {createHash}=require('node:crypto'),path=require('node:path'),{createRequire}=require('node:module');
const {build}=require('./soul-release.cjs');
const rw=createRequire(path.resolve(__dirname,'../apps/web/package.json')),rv=createRequire(rw.resolve('vite/package.json'));
const PIN='df17f668c1bbad7733ee9d0e004260ad99455e70d35f5c49897fd570ed5fb8d3';
const before='function u2(t){return G5.map(n=>({...n,items:t.filter(s=>nU(s.id)===n.id)})).filter(n=>n.items.length>0)}';
const after='function u2(t){return __WmsMenuGroups.regroupWorkspaces(G5.map(n=>({...n,items:t.filter(s=>nU(s.id)===n.id)})).filter(n=>n.items.length>0),window.location.hostname)}';
const marker='\nlet __soulComponent;function __SoulWorkspace(props){if(!__soulComponent){const __SoulReact=x;';
const suffix='\n__soulComponent=SoulBuild.SoulWorkspace;}return e.jsx(__soulComponent,props);}\n';
function compileGroups(){return rv('esbuild').buildSync({entryPoints:[path.resolve(__dirname,'../apps/web/src/lib/workspace-groups.ts')],bundle:true,write:false,format:'iife',globalName:'__WmsMenuGroups',minify:true,target:'es2020'}).outputFiles[0].text;}
function patch(source,compiled){
 if(createHash('sha256').update(source).digest('hex')!==PIN)throw Error('Production entry drift');
 const parts=source.split(marker);
 if(parts.length!==2||!parts[1].endsWith(suffix)||parts[0].split(before).length!==2)throw Error('Unknown navigation/adapter');
 const body=parts[0].replace(before,after);
 if(body.replace(after,before)!==parts[0])throw Error('Unexpected application diff');
 return compileGroups()+body+marker+compiled+suffix;
}
module.exports={patch,compileGroups,before,after,PIN};
if(require.main===module)build(process.argv[2],patch,'menu-groups-20260929').catch(e=>{console.error(e);process.exitCode=1;});
