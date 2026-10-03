# Cancelled unfinished KIZ binding

Our-WMS-only rule within existing physical-review/cancelled-reuse flags. Applies
only to administrator-confirmed review after caller checks role, active task,
warehouse, exact mark/box/SKU and positive available stock.

Every old binding must be RELEASED, never completed, in a closed request. No
shipment history may exist for this KIZ. Stored WB link must match client,
connection, order and request: REMOVED, cancel/canceled, without handedOverAt.
Fresh contradictory WB evidence rejects; unavailable old WB history is allowed
only with these local facts and a later exact physical pallet-sorting audit and
positive stock movement into the mark's current box. Duplicate/retired marks,
active tasks, shipped units, missing stock proof keep previous restrictions.

Before clearing only oldTask.kiz, save complete previous task, review/evidence
and physical proof in KIZ_UNFINISHED_CANCELLED_BINDING_ARCHIVED. Conditional
update checks status, completedAt, value and updatedAt. No quantities changed.

Fresh base API c6f92d91019ce0332537dedec816d335c23a633f5a40a40f137798fed71a0c21
includes newer parallel releases; only common/kiz-cancelled-reuse.js changes.
Source parity false: helper absent from historical TS, so patch.py/proof.js are
the reproducible runtime delta. No full source build; sold WMS not published.

11 new runtime tests: success failed before patch/pass after; negative cases
cover active/completed/shipped/not-cancelled/missing proof and confirmation.
12 previous returned-KIZ tests passed. Actual KIZ for request1676/order5941123608
passed a serializable rollback smoke; old5529804555 binding verified unchanged
after rollback. Final manager approval is still required in the UI.

Full local API: 2989 passed,129 skipped; dedicated KIZ integration excluded.
