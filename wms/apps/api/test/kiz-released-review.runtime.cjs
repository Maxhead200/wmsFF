// TEST: exercise the exact deployed module; no database or external API writes.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const file=process.env.KIZ_REVIEW_MODULE || require('node:path').resolve(__dirname,'../../../docs/releases/kiz-released-review/kiz-cancelled-reuse.js');
function fixture(options={}) {
 const old={id:'old',clientId:'c',status:options.status||'RELEASED',completedAt:new Date(),requestId:'r',orderId:'o',kiz:'identity',updatedAt:new Date()};
 const calls=[];let proofs=0;
 const tx={$queryRaw:async()=>[],fbsTsdAssembly:{findMany:async()=>[old],updateMany:async x=>{calls.push(x);return {count:options.race?0:1}}},
 clientRequest:{findMany:async()=>options.open?[]:[{id:'r'}]},shippedKizHistory:{findMany:async()=>options.noHistory?[]:[{kiz:'identity'}]},auditLog:{create:async()=>{}}};
 const proof={manualKizIdentity:x=>x,manualKizPrefixes:x=>[x],findSortingReturnProof:async()=>{proofs++;return options.noProof?null:{auditId:'return'};}};
 const exports={};vm.runInNewContext(fs.readFileSync(file,'utf8'),{exports,process:{env:{WMS_KIZ_CANCELLED_ADMIN_REUSE_ENABLED:options.disabled?'false':'true',WMS_KIZ_PHYSICAL_REVIEW_ENABLED:'true',WMS_KIZ_SORTING_ADMIN_REUSE_ENABLED:'true'}},require:n=>n==='@nestjs/common'?{ConflictException:Error}:proof});
 const evidence={checkedAt:new Date(Date.now()-(options.stale?61000:0)).toISOString(),decision:'REVIEW',circulation:options.retired?'RETIRED':null,orders:[{orderId:'o',verified:true,supplierStatus:options.cancel?'cancel':'complete',wbStatus:options.cancel?'canceled':'sorted'}]};
 return {calls,get proofs(){return proofs},run:()=>exports.releaseCancelledBindings(tx,'c','identity',evidence,'admin','review','current',options.physical!==false)};
}
test('released returned unit can free its historical binding',async()=>{const f=fixture();await f.run();assert.equal(f.calls.length,1);assert.equal(f.calls[0].where.status,'RELEASED');assert.equal(f.calls[0].data.kiz,null);assert.equal(f.proofs,1)});
for(const [name,opts] of Object.entries({active:{status:'IN_PROGRESS'},noReturn:{noProof:true},cancelWithoutReturn:{cancel:true,noProof:true},noPhysical:{physical:false},openRequest:{open:true},noHistory:{noHistory:true},stale:{stale:true},retired:{retired:true},disabled:{disabled:true}}))
 test('reject '+name,async()=>{const f=fixture(opts);await assert.rejects(f.run);assert.equal(f.calls.length,0)});
test('concurrent status change rejects conditional write',async()=>{const f=fixture({race:true});await assert.rejects(f.run);assert.equal(f.calls[0].where.status,'RELEASED')});
test('completed cancellation keeps previous behavior without return proof',async()=>{const f=fixture({status:'COMPLETED',cancel:true,noProof:true,physical:false});await f.run();assert.equal(f.calls[0].where.status,'COMPLETED');assert.equal(f.proofs,0)});
