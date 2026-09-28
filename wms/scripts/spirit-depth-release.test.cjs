// TEST: latest inventory/payroll JavaScript must survive a theme-only release.
const {test}=require('node:test'),assert=require('node:assert/strict'),{patch}=require('./spirit-depth-release.cjs');
test('changes only the versioned Spirit stylesheet',()=>{
 const index='<script src="/assets/inventory-week-20260928-0.js"></script><link href="/assets/payroll-card.css"><link href="/assets/spirit-warm-20260928.css">';
 assert.equal(patch(index).replace('spirit-depth-20260928.css','spirit-warm-20260928.css'),index);
 assert.throws(()=>patch(index+index),/drift/);assert.throws(()=>patch('no theme'),/drift/);
});
