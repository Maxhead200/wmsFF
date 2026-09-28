// FIX: additive, isolated cursor effect; do not rebuild the live application.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function patch(index){
 const css='/assets/spirit-depth-20260928.css';
 if(index.split(css).length!==2||index.split('</body>').length!==2||index.includes('spirit-tilt-20260928.js'))throw Error('Index drift');
 return index.replace(css,'/assets/spirit-tilt-20260928.css').replace('</body>','<script type="module" src="/assets/spirit-tilt-20260928.js"></script></body>');
}
async function main(){
 const out=process.argv[2];if(!out||fs.existsSync(out))throw Error('New output required');
 const web=path.resolve(__dirname,'../apps/web'),rw=createRequire(path.join(web,'package.json')),rv=createRequire(rw.resolve('vite/package.json'));
 const response=await fetch('https://wms.logoff.pro/');if(!response.ok)throw Error('Fetch failed');const index=await response.text(),next=patch(index);
 const built=await rv('esbuild').build({stdin:{contents:`import {installSpiritTileTilt} from './src/components/layout/spiritTileTilt';
 let dispose;function sync(){if(document.documentElement.dataset.uiVariant==='spirit'){if(!dispose)dispose=installSpiritTileTilt();}else{dispose?.();dispose=undefined;}}
 const observer=new MutationObserver(sync);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-ui-variant']});sync();
 window.addEventListener('pagehide',()=>{dispose?.();dispose=undefined;});window.addEventListener('pageshow',sync);`,resolveDir:web,loader:'ts'},bundle:true,write:false,format:'esm',minify:true,target:'es2020'});
 const js=built.outputFiles[0].text,css=fs.readFileSync(path.join(web,'src/components/layout/spirit-theme.css'),'utf8');
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'index.html'),next);fs.writeFileSync(path.join(out,'spirit-tilt-20260928.css'),css);fs.writeFileSync(path.join(out,'spirit-tilt-20260928.js'),js);
 fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify({indexBeforeSha:sha(index),indexAfterSha:sha(next),cssName:'spirit-tilt-20260928.css',cssSha:sha(css),files:{'spirit-tilt-20260928.js':{sha256:sha(js)}}},null,2));
 console.log('Isolated tilt script: '+Buffer.byteLength(js)+' bytes');
}
module.exports={patch};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
