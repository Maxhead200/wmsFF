# Receipt directions and FBS reservation protection

Our WMS only, PR target `feature/wb-print-check`. `WMS_RECEIPT_CHANNELS_ENABLED` defaults off; sold installation must not enable it.

Receipts are grouped by client, execution branch, year and box-code series across TSD sessions. Saved FBS/FBO directions apply to future boxes before placement. Manual membership corrects wrongly named boxes without changing barcodes, stock or archived state. Existing active FBS order identities retain access after FBS is disabled; new routes and WB publication exclude those boxes. FBO source scans, manual packaging and recovery protect outstanding FBS quantities. Already physically picked quantities are not reserved twice. Unassigned relabel orders conservatively protect potential mapped sources until their route is synchronized.

Administration requires ADMIN/OWNER, warehouse permission and client scope. Preview, revision and serializable save with audit; both channels off is rejected. Transfers between incompatible receipt policies are rejected. No schema migration. Periodic stock sync retries a failed immediate recalculation.

## Validation

- API complete sequential run, local PostgreSQL: 3007 passed, 83 skipped. Initial parallel run had four shared-DB integration failures; isolated rerun and complete sequential run passed. Skipped tests are not claimed as success.
- Web complete run: 355 passed, 2 skipped; API/web TypeScript passed.
- Targeted DB/controller/policy/adapter suite: 95 passed, plus three policy regressions in the full run.
- Exact packaged FBO runtime: 8 passed. Browser executes the actual versioned module: preview/cancel/save/manual membership/mobile/role isolation passed.
- Read-only production preview confirmed both requested series and preserved active FBS order identities. No historical receipt quantities are used to restore stock.

## Runtime packaging

Source parity remains false. Base: `2026-09-30-panthera-multi`, API `sha256:d976a490b412d33585d24a0eddb6392ea7304e5b50c2ae9699ffadd3f72327dc`. Materialize into `<release>/candidate-final`, apply `fbo-fbs-reservations-candidate.cjs`, generate scoped method deltas with `receipt-channels-methods.cjs <release>`, then `receipt-channels-patch.py <release>`. Web runtime script uses captured original web plus isolated component and versioned import graph. Check the exact nine-file API allow-list before staging. Do not deploy a whole source build.

Nine changed API modules: administration registry; marketplace service; Ozon pick workflow; stock operations; FBO two-stage service and reserve helper; receipt policy/controller; warehouse module. Preserve all other hashes, APK216, existing flags and sold WMS. Rollback tags: `logoff-api:before-receipt-channels`, `logoff-web:before-receipt-channels`. Rollback makes stored direction settings dormant; do not continue FBO-only stock operations on the old version.
