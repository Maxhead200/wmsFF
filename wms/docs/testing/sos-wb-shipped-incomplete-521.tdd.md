# SOS WB: shipped but physically incomplete request 521

## Source and user journey

The journey was derived from the production incident reported for WMS request 521.

As an SOS WB operator, I need a physically unfinished order to remain available after Wildberries has moved it to `shipped/complete`, so that I can record the actual KIZ in WMS without reopening or mutating the closed Wildberries order.

## TDD evidence

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | An open request counts unfinished `active` and `shipped` WB tasks, while removed/cancelled links remain outside the query | `counts active and shipped unfinished WB orders in the SOS request queue` | Unit | PASS | RED saw `lastCategory: "active"`; GREEN accepts `['active', 'shipped']` |
| 2 | A shipped but physically unfinished task can be claimed by an SOS device | `claims a shipped unfinished SOS order for local recovery` | Unit | PASS | RED saw the active-only query; GREEN claims the task once |
| 3 | A KIZ for a shipped/complete order is recorded locally and does not call the WB API | `accepts a KIZ locally for a shipped SOS order without mutating Wildberries` | Unit | PASS | RED failed with `Подключение Wildberries отключено`; GREEN completes with `wbMutationPerformed: false` |

### RED

Command:

```text
pnpm --filter @logoff/wms-api exec vitest run test/marketplace-connections.service.spec.ts -t "counts active and shipped unfinished|claims a shipped unfinished|accepts a KIZ locally for a shipped SOS"
```

Result before the production change: 3 failed, 136 skipped. The failures were the active-only list query, the active-only claim query, and the mandatory WB connection in the shipped KIZ path.

Checkpoint: `2926281 test: reproduce hidden shipped SOS request 521`.

### GREEN

The same command passed: 3 passed, 136 skipped.

TypeScript validation passed with:

```text
node typescript/bin/tsc -p tsconfig.json --noEmit
node typescript/bin/tsc -p tsconfig.json
```

Checkpoint: `ca25d25 fix: recover shipped incomplete orders in SOS WB`.

## Coverage and known gaps

The focused regression path is covered by three unit tests. The full marketplace service file currently reports 112 passing and 27 pre-existing failing tests; the failing count is unchanged from the baseline and consists primarily of incomplete legacy mocks plus two existing five-second timeouts. No new full-suite failure was introduced by this change.

No UI/APK code changed. Runtime production verification must confirm that request 521 is returned with its three unfinished orders after the API deployment.
