# Shared OpenClaw history in our WMS

Prepared 29 September 2026 on `feature/openclaw-wms-history-20260929`. This
branch is not published. Target PR: `publish/feature/wb-print-check` after
Konstantin's confirmation.

OpenClaw submissions already create durable `AuditLog` rows, but the WMS panel
kept its visible history in React state. Reloading or changing browsers removed
the conversation display. The new authenticated `GET /api/v1/wms-ai/openclaw/jobs`
reads those existing rows in pages of 20, including the actor, time, request,
status and result. Owners and currently authorized administrators see one shared
history. Staff, clients, demo users and a WMS with OpenClaw disabled are denied.
The old single-job endpoint and no-replay submission protocol remain unchanged.
Colleagues' conversations can be read but not continued under another user's
OpenClaw identity. A new conversation starts with a separate ID.

The page uses the WMS API on load, after acknowledging a finished job and for
pagination. Local browser storage remains only for the pending request ID, so a
lost response cannot cause the same server command to run again. It is not the
history store. No new table or database migration is needed. The query bounds
the existing `AuditLog` primary-key index to `openclaw:` IDs. On a read-only
production snapshot with 242,393 audit rows and 8 OpenClaw rows, the indexed
plan took 0.199 ms versus 32.359 ms for an unbounded action scan.

Impact: `WmsOpenClawService.listJobs`, `WmsAiController.openClawJobs`, the WMS
internal API catalog's `wms-ai` route count, `openclaw-api.ts`, `OpenClawPanel`
and its scoped CSS. The sold WMS is not deployed or configured by this branch;
its OpenClaw flag remains off. No stock, KIZ, billing, APK or task state changes.

The published API and web do not fully match this checkout's source. The release
builder overlays only three API runtime files and the embedded OpenClaw web
panel, adds one stylesheet, and adds its link to the current web index. It
preserves all other live bytes and refuses an unknown baseline. The captured
images for the reviewed candidate are API
`sha256:ff9265aa3b693bba2038053967ba690dcac36d325ec621eb7265a746e3fd348a`
and web
`sha256:0b41f6ce4ae558cee000289e724e41acfb3cb48f436fd9f94d3a43213fe8ecf0`.
Baseline: `C:/WMSFF2207/baselines/openclaw-history-live-20260929` and server
`/opt/logoff-wms-releases/openclaw-history-20260929/live`.

```powershell
$env:WMS_OPENCLAW_HISTORY_BASELINE='C:/WMSFF2207/baselines/openclaw-history-live-20260929'
node --test scripts/openclaw-history-release.test.cjs
node scripts/openclaw-history-release.cjs $env:WMS_OPENCLAW_HISTORY_BASELINE C:/WMSFF2207/tmp/openclaw-history-candidate
```

Before publication, reread both live image IDs and each input file hash.
If either image changed, capture a fresh baseline, rerun builder/tests and
review the delta. Do not deploy a full local API or web build. The isolated
server replay loaded all 8 historical entries with dates and actors, confirmed
the route decorator, and performed no database mutations or agent commands.
Full suites and TypeScript checks are recorded in the task report; the
dedicated KIZ database integration suite is excluded from the API run.

On the refreshed integration base `e9fab8e6`, API Vitest passed 2936 tests
with 115 skipped and zero failures; web Vitest passed 353 with 2 skipped.
API and web TypeScript `--noEmit` passed. Two runtime builder tests passed.
Reports: `C:/WMSFF2207/reports/openclaw-history-{api,web}-current-20260929.json`.

## Active web entry correction, 30 September 2026

The first web publication patched `/assets/openclaw-20260928-0.js`, which still
existed in the image but was not loaded by the current `index.html`. The live
entry was `/assets/payroll-compact-20260929-0.js`, so the page kept the old
panel even though the API and history stylesheet were published. A release
baseline must now record `webBundlePath`, and the builder refuses a path absent
from the captured index. The repair patches only that active entry bundle in
the current web image. The API, existing stylesheet, page index, stock and sold
WMS are unchanged. Verify the active entry name and image again before applying
the repair because later web releases may rename it.
