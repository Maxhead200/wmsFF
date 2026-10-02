# FIX: reuse the mutation handler, without the unused route response, inside recovery.
from pathlib import Path
import sys
p=Path(sys.argv[1])/'modules/tsd/fbo-two-stage.service.js';s=p.read_text(encoding='utf8')
a='const act = (action, fields = {}) => svc.act(id, { action, operationId: `${key}:${sequence++}`, ...fields }, user);'
b='// FIX: recovery needs mutations only; route reads widen serializable conflicts.\n        const act = (action, fields = {}) => svc.executeAction(id, { action, operationId: `${key}:${sequence++}`, ...fields }, user);'
assert s.count(a)==1,'Unexpected runtime; inspect before patching'
s=s.replace(a,b);p.write_bytes(s.encode('utf8'))
p=Path(sys.argv[1])/'modules/administration/fbo-problems.service.js';s=p.read_text(encoding='utf8')
a="if (!(error instanceof client_1.Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt >= 2)\n                    throw error;"
b="""// FIX: retry after rollback with a short pause; never expose contention as HTTP500.
                if (!(error instanceof client_1.Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034')
                    throw error;
                if (attempt >= 2)
                    throw new common_1.ConflictException('Параллельно изменяются складские данные. Повторите предпросмотр и применение операции.');
                await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));"""
assert s.count(a)==1,'Unexpected administrative runtime; inspect before patching'
s=s.replace(a,b);p.write_bytes(s.encode('utf8'))
