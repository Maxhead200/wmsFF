# Local validation — 2026-10-04

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
