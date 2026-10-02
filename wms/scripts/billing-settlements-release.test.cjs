// TEST: release patches preserve unrelated runtime and reject an unreviewed base.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const p=require('./billing-settlements-release.cjs');
test('reverse patch and ambiguous markers',()=>{assert.equal(p.edits('prefix A suffix',[['A','B']]),'prefix B suffix');assert.throws(()=>p.edits('AA',[['A','B']]));});
test('pinned runtime only',()=>{assert.throws(()=>p.patchWeb('drift',''));assert.throws(()=>p.patchApiModule('drift'));assert.throws(()=>p.patchCatalog('drift'));});
if(process.env.WMS_SETTLEMENTS_BASE){const base=process.env.WMS_SETTLEMENTS_BASE;
 test('actual billing UI adds only the reviewed deltas',()=>{const names=fs.readdirSync(base+'/web').filter(n=>n.endsWith('.js'));const s=names.map(n=>fs.readFileSync(path.join(base,'web',n),'utf8')).find(s=>s.includes('__billingFast'));const next=p.patchWeb(s,'var __billingSettlements={};');assert(next.includes('clients:h.data,revision:C'));assert(next.includes('te(id);g(id);I(section)'));assert(next.includes('Клиенты и расчёты'));});
}
