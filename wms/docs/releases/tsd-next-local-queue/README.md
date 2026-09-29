# TSD next queue: local loading without a selected request

Prepared on 28 September 2026; not published by this branch.

The terminal's first failed GET `/api/v1/tsd/fbs/next` at 20:42:57 MSK had
an empty requestId. Later selected-request calls for request 1508 returned
499 repeatedly, then 504. The active API retained the worker's assignment lock
and a `full:full:sync` marketplace/billing load for another client. An authenticated
live probe returned the request list in 281 ms but next-task loading exceeded
12 seconds. The generic Android timeout text incorrectly described scan confirmation.

`getNextFbsTsdAssemblyUnlocked` now uses saved WMS links even without requestId
when `WMS_FBS_TSD_FAST_LOCAL_ENABLED=true`. It does not enter full marketplace
history/billing loading or merge a second client-wide snapshot under the worker lock.
The existing client filter, eligibility, physical evidence and atomic assignment
checks remain unchanged. The flag is already enabled on our WMS. Disabled behavior
is covered by a test; the sold WMS is not deployed or configured by this change.

The pending-load regression test fails before this fix and passes afterward.
The same suite runs against the isolated runtime overlay. An isolated server replay
of the previously blocked client's unselected queue took 98 ms / 12 DB reads,
returned EMPTY, made no HTTP calls and attempted no mutations. This is candidate
evidence, not a claim that the active terminal has already recovered.

Validation on integration base `ddc6d9a1`: full API suite 2909 passed / 113 skipped,
web 281 passed, zero failures. The additional busy-guard compatibility case and
assignment suite passed together (5 tests); candidate runtime suite passed all
3 cases. Builder tests: 2 passed. TypeScript API `--noEmit` passed after regenerating
the local Prisma Client from the existing schema. Dedicated KIZ database integration
was excluded; it was not run against production. Baseline and single-file allowlist
checks passed. Reports are in `C:/WMSFF2207/reports/tsd-next-local-current-*-tests-20260928.json`.

PR372's busy-queue guard is included in the current source base. It prevents retry
backlogs; this change prevents the original unselected request from starting the
long sync. The builder preserves that guard and all unrelated runtime bytes.

Runtime preparation uses the verified baseline
`C:/WMSFF2207/baselines/openclaw-published-20260928`, image
`sha256:51484e2ea51ba0ea5594fd0dcd741cfdd2363681fbe7f33333191ae8c93c09b8`.
Source parity remains false. Never deploy a complete locally rebuilt API.

```powershell
python scripts/release_baseline.py verify --baseline <fresh-baseline>
python scripts/release_baseline.py materialize --baseline <fresh-baseline> --target <candidate>
node docs/releases/tsd-next-local-queue/build.cjs <candidate>
node --test docs/releases/tsd-next-local-queue/build.test.cjs
python scripts/release_baseline.py check-candidate --baseline <fresh-baseline> --target <candidate> --base-image <live-image> --allow modules/marketplace-connections/marketplace-connections.service.js
```

Reread the live image before publication. If PR372 or another API release has
been published, capture its runtime first and rebuild the overlay; never overwrite
it with the old candidate. Only one runtime file may change. No APK, web, schema,
stock, KIZ, task reset or bypass of an active assignment lock is part of this fix.

Development branch `fix/tsd-next-local-queue-20260928`; target PR
`publish/feature/wb-print-check`. Publication requires the user's PR confirmation.
