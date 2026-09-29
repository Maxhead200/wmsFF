# Physical KIZ review

The existing manager action rejects a recovered available unit when WB cannot verify an old order. This change allows ADMIN/OWNER approval using a later, audited physical sorting return. It never automatically approves a scan.

Scope: `releaseCancelledBindings` and two authenticated `KizReviewQueue.decide` / `decideUnit` call sites. `WMS_KIZ_PHYSICAL_REVIEW_ENABLED=true` is required, in addition to existing review flags. Default behavior, including the sold WMS, is unchanged.

Requirements retained: explicit confirmation and reason, branch/client access, matching available unit and box, positive balance, closed historical requests, completed historical tasks, shipment history, fresh evidence, advisory lock and conditional binding update. A sorting audit and positive stock movement must postdate historical shipment. Confirmed sale/retirement still requires relabeling. Old task snapshot is audited; shipment history is not altered. Approval is limited to the reviewed task/context or the existing single-unit claim mechanism.

Production source parity is false. Build only against the verified runtime; do not publish a full source build. `build.cjs` checks both original module hashes and updates exactly two files. Source is based on the deployed sorting-return helper, preserving that earlier fix.

Build: `node build.cjs <typescript-directory> <materialized-api-runtime>`.
Test: set `KIZ_CANDIDATE` to that runtime and run `node --test runtime.test.cjs` with API dependencies available.

Regression: before patch, the physical-recovery approval test fails with the reported conflict; other 29 tests pass. After patch the test passes. No production records changed by tests.

PR target: `feature/wb-print-check`, from `fix/kiz-review-owner-physical-approval`. Publication requires fresh baseline verification, candidate checks and explicit user approval. Rollback: restore the previous API image and disable the new flag; preserve audit records.

Validation: 33 candidate runtime tests passed; API 2929 passed / 115 skipped, web 343 passed / 2 skipped; API TypeScript passed. Dedicated PostgreSQL KIZ integration suite excluded because no isolated test database is configured. Server/live transaction validation remains pending publication preparation.
