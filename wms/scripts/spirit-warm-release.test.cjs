// TEST: retain newer payroll code and reject ambiguous theme payloads.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {patchAnalytics,COLORS,rewriteIndex}=require('./spirit-warm-release.cjs');
test('deploy keeps payroll352 API pin and versions CSS additively',()=>{
 const fs=require('node:fs');
 const wrapper=fs.readFileSync(__dirname+'/deploy-spirit-warm.py','utf8');
 assert.ok(wrapper.includes('sha256:edaec90e3b3b9e777c0dc9d4f3083a4ad9fe60036a454c6e0022f016b629797b'));
 const base=fs.readFileSync(__dirname+'/deploy-spirit.py','utf8');
 assert.ok(base.includes("proof.get('cssName','spirit-20260928.css')"));
 assert.ok(base.includes("raise RuntimeError('Changed old asset '+p)"));
 assert.ok(base.includes("raise RuntimeError('API restarted')"));
});
test('changes only Spirit chart colors, preserving payroll and calculations',()=>{
 const prefix='const payroll350=true;const sum=price*quantity;';
 const suffix='let __spiritComponent;'+COLORS.map(([c],i)=>`const c${i}="${c}";`).join('');
 const output=patchAnalytics(prefix+suffix);
 assert.equal(output.slice(0,prefix.length),prefix);
 for(const [old,next] of COLORS){assert.ok(output.includes(next));assert.ok(!output.includes(old));}
 assert.throws(()=>patchAnalytics(prefix),/Spirit/);
});
test('index keeps newer entry and all unrelated styles',()=>{
 const input='<script src="/assets/index-payroll350.js"></script><link href="/assets/payroll-card.css"><link href="/assets/spirit-20260928.css">';
 const output=rewriteIndex(input,'index-payroll350.js','index-warm.js');
 assert.ok(output.includes('payroll-card.css'));assert.ok(output.includes('index-warm.js'));
 assert.ok(output.includes('spirit-warm-20260928.css'));
 assert.throws(()=>rewriteIndex(input+input,'index-payroll350.js','index-warm.js'),/Ambiguous/);
});
