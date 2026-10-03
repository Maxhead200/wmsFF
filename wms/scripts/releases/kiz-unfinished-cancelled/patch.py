# FIX: patch the freshly verified runtime without replacing unrelated server code.
from pathlib import Path
import sys
p=Path(sys.argv[1])/'common/kiz-cancelled-reuse.js';s=p.read_text(encoding='utf8')
anchor="    if (links.some(t => (t.status !== 'COMPLETED'"
assert s.count(anchor)==1
addition='''    // FIX: preserve full audit before clearing only a never-shipped cancelled binding.
    const unfinishedProof = physicalReview ? await unfinishedCancelledProof(tx, clientId, identity, links, requests, evidence) : null;
    if (unfinishedProof) {
        for (const old of links) {
            await tx.auditLog.create({data:{userId,action:'KIZ_UNFINISHED_CANCELLED_BINDING_ARCHIVED',entity:'FbsTsdAssembly',entityId:old.id,payload:JSON.parse(JSON.stringify({reviewId,kizIdentity:identity,evidence,physicalConfirmation:true,sortingProof:unfinishedProof,before:old}))}});
            const changed=await tx.fbsTsdAssembly.updateMany({where:{id:old.id,clientId,status:'RELEASED',completedAt:null,kiz:old.kiz,updatedAt:old.updatedAt},data:{kiz:null}});
            if(changed.count!==1)throw conflict();
        }
        return;
    }
'''
s=s.replace(anchor,addition+anchor);s+='\n'+Path(__file__).with_name('proof.js').read_text(encoding='utf8');p.write_bytes(s.encode('utf8'))
