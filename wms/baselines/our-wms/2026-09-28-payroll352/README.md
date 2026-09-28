# PR352: payroll shifts and initial rates

Published API/web snapshot based on Spirit PR350/351 and KIZ PR348. Six API modules and 30 web files; all old assets retained. Additive migration 20260927192000_payroll_shift_corrections applied transactionally and registered. Generated Prisma Client uses live schema plus PayrollWorkDay/cancelledAt; exact schema captured. Source reference remains historical; parity false. Candidate CRUD verified in disposable schema-only database. Flags, APK215, other containers and config unchanged.

Rollback tags: logoff-api:before-payroll350 and logoff-web:before-payroll350. Old API ignores cancelledAt: do not roll back after user cancellations without reconciling them.
