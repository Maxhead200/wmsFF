# Soul — isolated interactive prototype

Run `node prototypes/soul/server.cjs` from `wms`, then open http://127.0.0.1:8767/.
Uses Cambria with Georgia/serif fallback. No external assets or production API.
Port can be changed with `SOUL_PORT`. Server binds only to loopback and allows GET only.

Tests: `node --test prototypes/soul/model.test.cjs prototypes/soul/browser.test.cjs`.
Set `WMS_TEST_PLAYWRIGHT` to the installed Playwright package path. Edge must be installed.
Optional `SOUL_SHOTS` points to an existing screenshot output directory.

Menu names/order/grouping are read from the selected checkout's `workspaces.ts` and
`App.tsx` at server startup. This is a complete demo catalogue, not a user's live
permission-filtered menu. Future integration must use `availableWorkspaces`.
Forms, search and navigation operate in memory only. Refresh resets the demo.
No production theme integration or deployment is included.
