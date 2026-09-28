// TEST: preserve live entry; reject duplicate installation and unknown CSS.
const {test}=require('node:test'),assert=require('node:assert/strict'),{patch}=require('./spirit-tilt-release.cjs');
test('adds only isolated tilt script and versioned CSS',()=>{
 const input='<script src="/assets/client-display-20260928-0.js"></script><link href="/assets/spirit-depth-20260928.css"></body>';
 const next=patch(input);
 assert.equal(next.replace('/assets/spirit-tilt-20260928.css','/assets/spirit-depth-20260928.css').replace('<script type="module" src="/assets/spirit-tilt-20260928.js"></script>',''),input);
 assert.throws(()=>patch(next),/drift/);assert.throws(()=>patch(input+input),/drift/);
});
