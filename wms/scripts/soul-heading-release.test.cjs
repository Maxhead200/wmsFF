// TEST: only the requested heading changes; stale releases are rejected.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {patch,before,after}=require('./soul-heading-release.cjs');
test('rejects drift',()=>assert.throws(()=>patch('changed'),/drift/));
test('changes only WMS LOGOff heading',async()=>{const r=await fetch('https://wms.logoff.pro/assets/billing-opening-20260929-0.js');assert.ok(r.ok);const s=await r.text(),next=patch(s);assert.ok(next.includes(after));assert.equal(next.replace(after,before),s);});
