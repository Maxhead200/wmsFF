# FIX: patch only the current, verified runtime; source parity is not asserted.
from pathlib import Path
import sys
p=Path(sys.argv[1])/'modules/tsd/fbo-two-stage.service.js'
s=p.read_text(encoding='utf8')
a='const svc = new FboTwoStageService_1(proxy, this.scopes, this.balances, this.stock, this.lock, this.files);'
b="if (!(error instanceof client_1.Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt >= 2)"
assert s.count(a)==1 and s.count(b)==1, 'Runtime changed: inspect before patching'
s=s.replace(a,a+'\n        // FIX: the outer administrative transaction owns rollback and retry.\n        svc.recoveryTransaction = true;')
s=s.replace(b,"if (this.recoveryTransaction || !(error instanceof client_1.Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt >= 2)")
p.write_bytes(s.encode('utf8'))
