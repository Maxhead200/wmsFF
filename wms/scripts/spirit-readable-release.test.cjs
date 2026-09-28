// TEST: preserve the newer application, la_panthera and the single tile listener.
const {test}=require('node:test'),assert=require('node:assert/strict'),{patch}=require('./spirit-readable-release.cjs');
test('changes only one stylesheet and rejects index drift',()=>{
 const input='<script src="/assets/la-panthera-20260928-0.js"></script><link href="/assets/spirit-graphite-20260928.css"><link href="/assets/la-panthera-20260928.css"><script src="/assets/spirit-graphite-20260928.js"></script>';
 const next=patch(input);
 assert.equal(next.replace('spirit-readable-times-20260928.css','spirit-graphite-20260928.css'),input);
 for(const bad of [next,input+input,''])assert.throws(()=>patch(bad),/drift/);
});
