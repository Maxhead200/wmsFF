// FIX: replace only the previous Spirit overlay; preserve the current live application.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function patch(index){
 for(const ext of ['css','js']){
  const old='/assets/spirit-green-20260928.'+ext,next='/assets/spirit-graphite-20260928.'+ext;
  if(index.split(old).length!==2||index.includes(next))throw Error('Index drift');
  index=index.replace(old,next);
 }
 return index;
}
async function main(){
 const out=process.argv[2];if(!out||fs.existsSync(out))throw Error('New output required');
 const web=path.resolve(__dirname,'../apps/web'),rw=createRequire(path.join(web,'package.json')),rv=createRequire(rw.resolve('vite/package.json'));
 const response=await fetch('https://wms.logoff.pro/');if(!response.ok)throw Error('Fetch failed');const index=await response.text(),next=patch(index);
 const built=await rv('esbuild').build({stdin:{contents:`import {installSpiritTileTilt} from './src/components/layout/spiritTileTilt';
 let dispose;function sync(){dispose?.();dispose=installSpiritTileTilt();}
 const observer=new MutationObserver(sync);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-ui-variant']});sync();
 window.addEventListener('pagehide',()=>{dispose?.();dispose=undefined;});window.addEventListener('pageshow',sync);`,resolveDir:web,loader:'ts'},bundle:true,write:false,format:'esm',minify:true,target:'es2020'});
 const js=built.outputFiles[0].text,css=fs.readFileSync(path.join(web,'src/components/layout/spirit-theme.css'),'utf8')+'\n'+fs.readFileSync(path.join(web,'src/components/layout/tile-motion.css'),'utf8');
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'index.html'),next);fs.writeFileSync(path.join(out,'spirit-graphite-20260928.css'),css);fs.writeFileSync(path.join(out,'spirit-graphite-20260928.js'),js);
 fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify({indexBeforeSha:sha(index),indexAfterSha:sha(next),cssName:'spirit-graphite-20260928.css',cssSha:sha(css),files:{'spirit-graphite-20260928.js':{sha256:sha(js)}}},null,2));
 console.log('Isolated Spirit script: '+Buffer.byteLength(js)+' bytes');
}
module.exports={patch};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
