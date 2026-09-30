# la_panthera operational windows and WB tiles

Only the opt-in la_panthera theme changes. Operational online-execution and FBS assembly dialogs retain the underlying page; minimize keeps their React page mounted until restored or closed. A single right-edge dock holds all minimized windows. Account/warehouse changes clear retained pages. No drafts survive reload/logout. Confirmation dialogs are excluded.

WB tiles 2–15 are square; the active-order/client tile spans two rows on wide screens. Narrow screens reflow to four or fewer columns without clipping titles. Other themes and marketplaces retain their layout.

## Validation

- Browser regression: old light backdrop is opaque white; fixed backdrop is translucent.
- Actual React forms: minimize, switch workspace, retain two independent drafts, restore, close; no page errors.
- CSS geometry at 1920/1440/1024/390 in light/dark; other-theme/Ozon isolation.
- Actual captured runtime: Requests/FBS/FBO lazy modules open with one React owner; window restore and square WB tiles verified.
- Web355 passed/2 skipped; API2939 passed/115 skipped; dedicated KIZ database suite excluded. TypeScript passed.

## Runtime

Source parity remains false. `scripts/panthera-windows-runtime.cjs <release-directory>` takes `before-web/`, writes `web/` and `delta.json`. Set ESBUILD_MODULE if esbuild is not on the default module path. It versions all 29 current JS modules together (27 change only import paths), adds scoped CSS and changes index.html. No existing assets are deleted. This preserves a single React instance, unlike replacing only the entry. Current Soul request-card CSS is retained.

Stage from the freshly captured image, guard API/web IDs under release locks, verify all changed public asset hashes, preserve API/DB/APK/flags, roll back on failure. Sold WMS is not a deployment target.


## Follow-up: independent windows in the same workspace

Minimizing now retains a unique page instance, and opens a fresh instance of the same section for the next request. Restoring selects that exact instance, preserving its state and callbacks. The original workspace-level key allowed a second request to overwrite the first minimized dialog. Browser tests now use two dialogs from the same section plus a third from another section, verify independent drafts and closure, and compare control center lines in the real action-toolbar CSS.

The minimize control uses the existing icon-button styling and is inserted immediately before Close in its action row. No absolute offsets or extra header padding. The runtime follow-up generator is `scripts/panthera-multiple-windows-runtime.cjs`; capture hashes are required and the entire module graph is versioned together. Business API behavior is unchanged.
