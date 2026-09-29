// FIX: bounded patch of the verified production entry, without a stale application rebuild.
const {createHash}=require('node:crypto');
const {build}=require('./soul-release.cjs');
const PIN='57693223ff083e8f31a5fa06ba6fb660b3ce8a392fa5ab75d5bf2996f8a61966';
const own='["wms.logoff.pro","localhost","127.0.0.1"].includes(window.location.hostname)';
const boundary='{value:"winx",label:"WingX · Эля",personal:"winx"}],K5=';
const next='{value:"winx",label:"WingX · Эля",personal:"winx"}].filter(option=>!('+own+')||!["spirit","classic","space","future3100","obsidian","aerospace"].includes(option.value)),K5=';
const fallback='return!s||s.personal==="winx"&&!Rj(t)?"classic":s.value';
const replacement='return!s||s.personal==="winx"&&!Rj(t)?('+own+'?"modern":"classic"):s.value';
function patch(source){
 if(createHash('sha256').update(source).digest('hex')!==PIN)throw Error('Production entry drift');
 for(const marker of [boundary,fallback])if(source.split(marker).length!==2)throw Error('Ambiguous marker');
 const result=source.replace(boundary,next).replace(fallback,replacement);
 if(result.replace(next,boundary).replace(replacement,fallback)!==source)throw Error('Unexpected diff');
 return result;
}
module.exports={patch,PIN};
if(require.main===module)build(process.argv[2],patch,'themes-retired-20260929').catch(e=>{console.error(e);process.exitCode=1;});
