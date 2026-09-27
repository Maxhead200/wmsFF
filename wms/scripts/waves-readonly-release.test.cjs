// TEST: reject stale release inputs and ambiguous replacement markers.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {patch,once}=require('./waves-readonly-release.cjs');
test('rejects production drift',()=>assert.throws(()=>patch('older bundle',''),/drift/));
test('rejects missing and duplicate replacement markers',()=>{assert.throws(()=>once('abc','x','y'));assert.throws(()=>once('xx','x','y'));assert.equal(once('abc','b','d'),'adc')});
