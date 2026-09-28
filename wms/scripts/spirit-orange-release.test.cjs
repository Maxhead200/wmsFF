// TEST: retain all live markup and reject duplicate or missing overlay references.
const {test}=require('node:test'),assert=require('node:assert/strict'),{patch}=require('./spirit-orange-release.cjs');
test('replaces precisely two Spirit assets without installing a second listener',()=>{
 const input='<script src="/assets/cabinet-fast-20260928-0.js"></script><link href="/assets/spirit-tilt-20260928.css"><script src="/assets/spirit-tilt-20260928.js"></script>';
 const next=patch(input);
 assert.equal(next.replaceAll('spirit-orange-20260928','spirit-tilt-20260928'),input);
 assert.throws(()=>patch(next),/drift/);assert.throws(()=>patch(input+input),/drift/);assert.throws(()=>patch(''),/drift/);
});
