# Administrator physical KIZ confirmation

Target: our WMS only, feature/wb-print-check. Flag WMS_INVENTORY_PHYSICAL_RESOLUTION_ENABLED defaults off. Sold WMS keeps its existing behavior.

The existing confirmation validates the latest completed recount, unique KIZ scans, target quantities, permissions, and box locks. The new helper then resolves a single historical registration whose SKU or status conflicts with the physical scan. It debits the old SKU/status at its recorded source at most once and never credits the already-counted destination. BLOCKED/SHIPPING registrations do not consume another AVAILABLE unit. Historical shipments, orders, printing and billing are untouched. The previous registration and source debit are retained in a dedicated audit event.

Active FBS/FBO picks, another client/warehouse, ambiguous duplicate registrations, and changes after the recount began still require their corresponding reconciliation; this patch does not silently discard live assembly work. In particular, the separately requested transfer into BOX_0222 occurred after its 15:14 UTC recount: the old recount must not erase that incoming unit. Full confirmation of this old snapshot remains blocked pending a current physical count; the cross-SKU helper itself was verified on the real rows with rollback.

Files/functions:
- modules/inventory/confirmed-kiz-composition.ts: confirmInventoryKizComposition hook.
- modules/inventory/confirmed-kiz-physical-resolution.ts: resolveConfirmedPhysicalKiz.
- test/inventory-confirmed-kiz.spec.ts; test/inventory-physical-resolution.spec.ts.

Validation:
- Two reproductions failed before the patch, 84 pre-existing focused tests passed.
- 99 focused checks passed after the patch, including ADMIN/OWNER, BLOCKED/SHIPPING, retry, role/ownership/time and concurrency guards.
- API 2859 passed, 97 skipped; DB integration suite excluded because its dedicated test DB is not configured.
- Web: 247 tests passed after restoring missing local dependency links.
- API TypeScript passed after regenerating the stale local Prisma client.
- Isolated runner using the current production image and rollback: BOX_003 full decideLine reached RESOLVED; BOX_0222 cross-SKU resolution debited old source 5 -> 4, then rolled back.
- Candidate baseline guard: only confirmed-kiz-composition.js and new confirmed-kiz-physical-resolution.js differ from image sha256:91f592f9ea0420cecefd508b0c3bf64c9ffc1385d35070fe3d601a3832896cd6.

Published through PR337 on 27.09.2026. Post-publication health, full runtime hashes, flags and both real-data rollback checks passed. Snapshot: 2026-09-27-admin-physical-kiz. Rollback image: logoff-api:before-admin-physical-337. Recheck live image before any future publishing. Preserve the existing runtime composition implementation (including rediscovery, scanned return and alias reconciliation); insert only the same helper hook and new compiled helper, never replace the runtime service with the older Git implementation. No migration.
