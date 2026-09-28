// FIX: additive visual-only overlay of live payroll352; no application rebuild.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const web=path.resolve(__dirname,'../apps/web'),rw=createRequire(path.join(web,'package.json'));
const {parseAst}=createRequire(rw.resolve('vite/package.json'))('rollup/parseAst');
const COLORS=[['#a6b4ce','#625d56'],['#19263e','#fcfaf6'],['#33435d','#d6cfc4'],['#edf2fc','#302e2b'],['#2b3952','#ded6ca'],['#f69ba7','#a53d38'],['#7de2c3','#28654b']];
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function once(s,a,b){if(s.split(a).length!==2)throw Error('Ambiguous marker '+a);return s.replace(a,b)}
function patchAnalytics(source){
 const marker='let __spiritComponent;',parts=source.split(marker);
 if(parts.length!==2)throw Error('Spirit wrapper missing or ambiguous');
 let tail=parts[1];
 for(const [a,b] of COLORS){if(!tail.includes(a)||tail.includes(b))throw Error('Spirit palette drift '+a);tail=tail.replaceAll(a,b);}
 let reverse=tail;for(const [a,b] of COLORS)reverse=reverse.replaceAll(b,a);
 if(reverse!==parts[1])throw Error('Non-visual change');
 const output=parts[0]+marker+tail;parseAst(output);return output;
}
function rewriteIndex(index,entry,next){return once(once(index,'/assets/'+entry,'/assets/'+next),'/assets/spirit-20260928.css','/assets/spirit-warm-20260928.css')}
async function get(url){const r=await fetch(url);if(!r.ok)throw Error('HTTP '+r.status+' '+url);return r.text()}
async function main(){
 const out=process.argv[2];if(!out||fs.existsSync(out))throw Error('Provide NEW output directory');
 const index=await get('https://wms.logoff.pro/');
 const entry=index.match(/src="\/assets\/([^"/]+\.js)"/)[1];
 if(entry!=='index-spirit-20260928-payroll350.js')throw Error('Production entry changed');
 const graph=new Map(),pending=[entry];
 while(pending.length){const name=pending.pop();if(graph.has(name))continue;
  if(!/^[\w.-]+\.js$/.test(name))throw Error('Invalid asset');
  const text=await get('https://wms.logoff.pro/assets/'+name);graph.set(name,text);
  for(const m of text.matchAll(/["']\.\/([^"']+\.js)["']/g))if(!graph.has(m[1]))pending.push(m[1]);
 }
 const analytics=[...graph.keys()].filter(n=>n.startsWith('AnalyticsPanel-'));if(analytics.length!==1)throw Error('Analytics graph changed');
 const patched=patchAnalytics(graph.get(analytics[0]));
 // Short names avoid growing legacy path lengths; all references share one React instance.
 const names=Object.fromEntries([...graph.keys()].map((n,i)=>[n,`spirit-warm-20260928-${i}.js`]));
 const reverseNames=Object.fromEntries(Object.entries(names).map(([a,b])=>[b,a]));
 const rewrite=(s,m)=>s.replace(/[\w.-]+\.js/g,n=>m[n]||n);
 fs.mkdirSync(out,{recursive:true});const files={};
 for(const [name,original] of graph){const expected=name===analytics[0]?patched:original;const next=rewrite(expected,names);
  if(rewrite(next,reverseNames)!==expected)throw Error('Reference rewrite changed code');parseAst(next);
  fs.writeFileSync(path.join(out,names[name]),next);files[names[name]]={sha256:sha(next),original:name,originalSha256:sha(original)};
 }
 const css=fs.readFileSync(path.join(web,'src/components/layout/spirit-theme.css'),'utf8');
 fs.writeFileSync(path.join(out,'spirit-warm-20260928.css'),css);
 const html=rewriteIndex(index,entry,names[entry]);fs.writeFileSync(path.join(out,'index.html'),html);
 fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify({indexBeforeSha:sha(index),indexAfterSha:sha(html),cssName:'spirit-warm-20260928.css',cssSha:sha(css),files},null,2));
 console.log(JSON.stringify({chunks:graph.size,entryPreserved:entry,analyticsColorOnly:analytics[0],output:out}));
}
module.exports={patchAnalytics,COLORS,rewriteIndex};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
