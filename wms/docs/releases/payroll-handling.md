# Handling review and tablet readability

Payroll handling imported from a tablet could not be confirmed when a participant had no pallet rate. Administrators can now enter a one-off RUB/pallet tariff beside the operation; confirmation divides it across the participants and records the tariff and shares in the audit. An empty field uses existing individual conditions at work start. Personal conditions are never overwritten.

Only REVIEW operations can be corrected (time, kind, count, participants) or cancelled with a reason. Cancellation retains the operation and audit, but excludes it from accruals. CONFIRMED operations cannot be edited or cancelled through these actions. Row locking serializes confirmation and cancellation. Existing branch permissions and the payroll feature flag remain required. No schema migration.

The employee activity filter is included. Attendance APK 0.2.2 (code 4, min API 26) has larger text, larger action buttons and visible shift state; registration, photo capture and synchronization are retained.

Changed shared modules: payroll controller, DTO, service, web PayrollManagement, internal API registry; Android attendance MainActivity and version. Publish only to our WMS. Sold WMS is not deployed and retains its previous runtime/flags.

Validation: 2892 API tests passed / 94 skipped, plus two additional PostgreSQL integration cases passed. Dedicated KIZ duplicate integration suite excluded. 255 web tests passed after integration of PR345; TypeScript passed. Android 72 tests, lint, APK signature/minSDK/ABIs verified. Physical tablet UI still requires user verification.

Runtime must be materialized from the freshly captured `2026-09-27-waves345` baseline. Three payroll modules matched their source compilation exactly before modification. Patch the registry route count only; preserve all other runtime modules, web assets and read-only waves. Source/runtime parity for the whole system remains false.
