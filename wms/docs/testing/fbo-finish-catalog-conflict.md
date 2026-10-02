# FBO completion: unchanged billing catalog writes

Request 1568 / supply 41495678: 585 picked and packed units, 70 confirmed boxes.
Production logs on 2026-10-02 at 16:27–16:29 UTC record serialization failures
and a 60-second transaction expiry at `billingService.upsert`, called by
`ensureStandardFulfillmentService` during FBO completion.

// FIX: `WMS_FULFILLMENT_CATALOG_READ_FIRST=true` reuses an unchanged global
service and existing client tariff within the same transaction. Actual catalog
changes and missing tariffs retain the old upsert path. Custom tariffs, inactive
client services, source-key duplicate-charge guards and stock validation remain
unchanged. Flag absent/false preserves sold-WMS behavior. Enable only for our WMS.

The ordinary FINISH path and the administrative recovery FINISH path both use
this billing helper. Recovery transaction retries and revision checks remain
intact. This removes one observed contention source; it does not guarantee that
other concurrent writes cannot cause a serialization retry.

// TEST: `apps/api/test/fulfillment-catalog-conflict.spec.ts` covers read-only
reuse, client tariff preservation, nullable/Decimal prices, catalog initialization
and repairs, flag-off behavior and duplicate-charge avoidance. The regression
failed before the change and passed afterward.

// TEST: `apps/api/test/fulfillment-catalog-conflict.runtime.cjs` extracts the
actual compiled method for isolated execution. Both tests fail on the captured
production method and pass on the candidate, including concurrent calls.
These are mocked transaction tests, not a PostgreSQL contention benchmark.

Candidate base API image:
`sha256:1b186bf6e015f0144c973bff8b67b1825739b2774d7556666bab53d8a8157764`.
Captured 563 deployed files. Verified the old compiled method matches the Git
baseline before replacing only that method. `release_baseline.py check-candidate`
passes with only `modules/stock/stock-operations.service.js` allowed.
Local evidence: `D:/WMSFF/_Kof/work/fbo-finish-conflict`.

TypeScript passes using an isolated Prisma client generated from this branch's
schema. Shared local dependencies had stale payroll types; they were not modified.
API suite excludes `kiz-duplicate.integration.spec.ts`, which requires a dedicated
local test database. Environment-gated integration skips are not claimed verified.
Final API run: 3,014 passed, 129 skipped; 271 suites passed, 7 skipped.
Both compiled-method runtime tests passed; TypeScript and diff whitespace checks passed.

No deployment or production business-data changes performed. Before publishing,
recheck live image and candidate hashes, enable the flag only on our WMS, and verify
the complete FBO action. Do not deploy a full source build: source/runtime parity
is still false. Target PR: `feature/wb-print-check`.
