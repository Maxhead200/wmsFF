# Box consolidation: physical and processing stock

## Source and user journey

The behavior was derived from the production incident reported for boxes where WMS showed more units than were physically present.

- As a warehouse administrator, I want whole-box consolidation to move only goods physically present in the box, so active FBS picks keep their original workflow binding.
- As a warehouse user, I want the turnover screen to separate physical units from goods already picked or awaiting shipment.

## RED/GREEN evidence

| Guarantee | Test | Type | RED | GREEN |
|---|---|---|---|---|
| `PACKING` and `SHIPPING` balances and KIZ are not moved by whole-box consolidation | `apps/api/test/stock-whole-box-transfer.spec.ts` | unit | Existing implementation queried and moved every positive status | 2/2 tests passed |
| Turnover reports physical stock separately from picked/shipping stock | `apps/api/test/turnover-physical-quantity.service.spec.ts` | unit | `physicalQuantity` and `processingQuantity` were absent | 1/1 test passed |

## Commands and results

- RED: direct Vitest run of `stock-whole-box-transfer.spec.ts` — 1 new test failed for the missing status filter; the existing test passed.
- RED: direct Vitest run of `turnover-physical-quantity.service.spec.ts` — failed because the two separated quantities were absent.
- GREEN: direct Vitest run of both affected API test files — 3/3 tests passed.
- Web TypeScript check — passed.
- API TypeScript check/build — passed.
- Web Vitest suite — 29/29 tests passed.
- Web Vite production build — passed (existing font/image and chunk-size warnings only).
- Full API Vitest suite — 522 passed, 72 pre-existing unrelated failures caused mainly by stale branch/warehouse mocks and missing mocked Prisma methods; neither affected test failed.

## Coverage and known gaps

The regression paths are covered by focused unit tests. No database migration or production data mutation is part of this change. The repository-wide API suite is not fully green on the branch for reasons unrelated to these files; those failures were not modified as part of this surgical fix.

## Merge evidence

- RED checkpoint: `dba3981` — whole-box processing-stock reproducer.
- GREEN checkpoint: `855e305` — physical-only whole-box consolidation.
- RED checkpoint: `c6340b2` — turnover quantity-separation reproducer.
