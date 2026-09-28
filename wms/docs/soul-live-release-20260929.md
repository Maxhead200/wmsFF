# Soul live navigation — 2026-09-29

Opt-in theme for `wms.logoff.pro` and localhost only. Uses permission-filtered
groups and the existing page renderer; browsing groups preserves the current
page. No API, database, authorization, calculations, Android or sold WMS changes.
Cambria, warm light palette, responsive four/two/one-column menu.

Source files: App.tsx, SoulWorkspace.tsx and soul-theme.css. The isolated
`prototypes/soul` remains a demo and is not deployed.

Source parity is not verified: do not deploy a full build from this checkout.
`scripts/soul-release.cjs` checks the published entry SHA and applies an additive
adapter preserving all existing renderer arguments and old themes. Deployment
uses `deploy-soul.py` plus the existing guarded `deploy-spirit.py` helper. It
checks both current images, index/chunk hashes, preserves every old asset,
keeps the API container unchanged and rolls back on verification failure.

Tests: 258 web tests, TypeScript noEmit, 3 release tests and isolated browser
navigation/state/keyboard/responsive test at 1440/1024/390 px. No authenticated
production business transaction was performed. The patch does not merge the
unpublished Spirit icon changes into the runtime.

Select Soul in the existing theme selector; another theme restores the old
navigation. Rollback image: `logoff-web:before-soul-live-20260929`.
