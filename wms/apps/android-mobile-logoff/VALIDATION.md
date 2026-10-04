# Local validation — 2026-10-04

## Unpublished financial actions increment

- New API contract test failed before implementation, then passed.
- 12 JUnit tests and 9 Node contracts passed; debug assembly successful.
- Android Lint successful; no production financial mutation performed.
- Native period close, adjustment and late-work preview/confirmation added.
- Pending body/identity persisted before POST; uncertain result blocks fresh actions.
- Screen generation and user/client/branch checks guard stale callbacks/confirmation.
- Physical-device and authenticated end-to-end validation remain pending.
- Not included in published APK 0.6.1; debug APK is not for distribution.

## 0.6.1-soul (24): correction history

- New correction-history contract failed before implementation, then passed.
- Node contracts: 8 passed. JUnit: 9 passed, no failures/errors/skips.
- `testLogoffDebugUnitTest assembleLogoffRelease lintLogoffDebug`: successful (5m34s).
- Lint: 0 errors, 99 warnings (including inherited/localization warnings).
- Signed non-debuggable release certificate matches attached APK.
- SHA-256: `64da5179dea15e760efdf7431a40eccb93e3d6052c5e265c812bfb2a320ccdeb`.
- Candidate: `C:/WMSFF2207/outputs/mobile-soul-20261004/logoff-wms-0.6.1-soul-candidate.apk`.
- Read-only history uses existing server scope and labels its 2000-record/all-date limit.
- No connected Android device; physical installation, login and UI remain unverified.
- Original mobile module, TSD, server and sold tenants untouched.

## Previous 0.6.0-soul (23)

- Initial contract run: 3 failures before isolation, Soul entry and financial API additions.
- Additional rejected-OpenClaw-request regression: failed before response classification fix.
- Final Node contracts: 7 passed.
- Final JUnit policies: 6 passed, 0 skipped/failures/errors.
- `testLogoffDebugUnitTest assembleLogoffRelease lintLogoffDebug`: BUILD SUCCESSFUL.
- Android Lint: no errors; warnings remain (localization and inherited code/dependencies).
- `git diff --cached --check`: passed before commit.
- Signed release: package `pro.logoff.wms.mobile`, 23 / `0.6.0-soul`, non-debuggable.
- APK certificate matches the user's attached 0.5.3 certificate.
- APK SHA-256: `1ba33fb919e861243c93fb0a95bfa4c55683c65dbbb331be6ed13eb6a361f8ef`.
- Candidate file: `C:/WMSFF2207/outputs/mobile-soul-20261004/logoff-wms-0.6.0-soul-candidate.apk`.

NOT verified: physical-device rendering, installation/data migration, authenticated
end-to-end operations against the current server, all roles/branches, and full web
feature parity. `adb devices` returned no connected device. No production mutation,
APK distribution/upload or server deployment was performed. This is a local candidate.
