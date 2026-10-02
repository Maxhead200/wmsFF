# FBO recovery: avoid route reads during writes

Runtime-only delta for our WMS; sourceParityVerified=false. Neither
recoverInTransaction nor FboProblemsService exists in the historical TypeScript
checkout. Do not replace the production module with a full source build.

patch.py changes two verified runtime functions:
- FboTwoStageService.recoverInTransaction calls executeAction instead of act.
  The discarded plan response was reading warehouse-wide route inputs inside
  the serializable write transaction, increasing conflict exposure.
- FboProblemsService.apply waits50/100ms between its three fresh transactions;
  exhaustion raises an explanatory ConflictException409, not raw Prisma500.
  Permissions, preview revision, locks, packing validators and receipt remain.

Current base API b5241036c24526715e4d880950f98f3ecf18fda00e6fea16be1ad390afc94209.
Candidate API3278a1e6c2f0f959324f5f0000c546b960927ef96793ad49663171c88807cfe7.
Exact delta checked against all560files. Sold WMS is not deployed; no flags,
web or APK changes. Data1568 unchanged.

Regression reproduced before patch;4 new runtime tests pass afterwards and
5 previous transaction-owner tests remain green. Full local API2989passed,
129skipped; dedicated KIZ database integration excluded.

Real preview/apply of1568 and unit2b960eee-669c-420e-89f3-f70d28b8845d into
FFL_LKBFBO0110_013 completed on candidate in1275ms inside an intentionally
rolled-back serializable transaction. Persisted unit verified unchanged/PICKED.
Old version also succeeded in a quiet interval in1908ms: contention is
intermittent; this smoke does not prove conflicts are impossible. The regression
proves removal of unused route reads and a clear409after bounded retries.
