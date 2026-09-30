# FBO must preserve FBS reservations

Status: prepared, not published. Target: `feature/wb-print-check`, our WMS only.

Incident: WB order 5908617159 had an FBS reservation before FBO request 1550
consumed all 25 physical units. The old FBO service deliberately cleared an
untouched FBS route after picking its stock.

The route now exposes only AVAILABLE quantity minus outstanding FBS demand,
with both per-box and warehouse limits. Actual picking validates the same limit
inside its existing serializable transaction. Whole-box picking cannot bypass
the limit. FBS tasks are never displaced by this operation.

Relabeling protects the source SKU until conversion is confirmed. Physical FBS
PACKING movements reduce outstanding reserved quantity, so an already picked
unit is not deducted twice. Closed/shipped virtual reservations are excluded;
unresolved physical IN_PROGRESS/RETURN_REQUIRED assignments remain protected.

Runtime-only manual packaging and physical KIZ recovery use the same guard.
Already picked FBO units can still be repacked; active FBS KIZ assignments cannot
be released by recovery. Existing recovery, mixed boxes, parallel packaging,
remainder closure, location routing and route preferences are retained.

## Exact runtime candidate

Source parity remains false. Do not publish the complete local build.
`scripts/fbo-fbs-reservations-candidate.cjs` patches a materialized runtime only
after checking the exact original service hash. Its allow-list is:

- `modules/tsd/fbo-two-stage.service.js`
- `modules/tsd/fbo-fbs-reservations.js`

Verified API base image:
`sha256:d976a490b412d33585d24a0eddb6392ea7304e5b50c2ae9699ffadd3f72327dc`.
Baseline: `2026-09-30-panthera-windows`. The web image changed independently
after that snapshot; this API candidate must not replace web, APK or flags.
Recheck the live API image under the release lock before publication.

## Validation

- Source unit tests: 25 minus one reserve, unbound warehouse demand, relabeling.
- Local PostgreSQL integration: whole/partial picks, concurrent scans, branch
  scope, already debited and partially debited FBS orders, existing FBO workflow.
- `test/fbo-fbs-reservations.runtime.cjs`: exact runtime route and mutation
  guards, manual packaging, active KIZ ownership and cross-box recovery.
  Six regression cases fail on the baseline; all eight candidate cases pass.
- TypeScript and `release_baseline.py verify/check-candidate`.

Local results: full sequential API suite 2,982 passed / 83 skipped (266 passing
files); final focused suite after additional edge cases 40/40; candidate runtime
8/8; TypeScript and candidate allow-list passed. An initial parallel full run
hit three failures in the shared-database KIZ identity suite; that suite passed
5/5 in isolation and the complete sequential run passed. The skipped suites
retain their existing external/dedicated database prerequisites.

The runtime test accepts `FBO_RUNTIME_UNDER_TEST` pointing to the service in a
materialized runtime. Node dependencies must resolve to this API's dependencies.
The database tests accept only the dedicated local test database URL already
guarded in `fbo-two-stage.integration.spec.ts`. No production writes or print jobs
are required for verification.

The existing `WMS_FBO_TWO_STAGE_ENABLED` entry-point flag gates the change.
Sold WMS and its branch are not modified; shared FBO modules are changed only in
our release artifact. This does not replenish the already shipped 25 units or
retroactively modify order 5908617159.
