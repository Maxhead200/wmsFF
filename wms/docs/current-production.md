# Published PR381: la_panthera / 28.09.2026

PR381: la_panthera web contrast correction across 26 representative component states and 47 module stylesheet audit, larger dashboard/FBS labels, saturated icons and dark gradients. Red gradient navigation hover with reduced-motion support; compact dark payroll editor. Parallel spirit PR378/380 (previous web da2baf1a), API PR375, APK216, settings and other containers preserved. 281 web and 2891 API tests passed, 113 skipped; dedicated KIZ DB suite excluded. Browser contrast/isolation/print and runtime graph/font checks passed. Source parity false; runtime CSS overlay only. Rollback logoff-web:before-la-panthera-complete.

Web `sha256:97781c96c22ef56db57f31f301477b164cde4b525da76e8d5025e5cb19da16dc`; API `sha256:a83204a8bb4819193a11ba7ba8a3b462c960ef772fc9d659c88a122dfd531f62`.
Baseline `2026-09-28-la-panthera-complete`.

## Previous release

# Published PR377: la_panthera / 28.09.2026

PR377: la_panthera web contrast correction across 17 representative screens, larger dashboard/FBS labels, saturated icons and dark gradients. API PR375, APK216, settings and other containers preserved. 281 web and 2891 API tests passed, 113 skipped; dedicated KIZ DB suite excluded. Browser contrast/isolation/print and runtime graph/font checks passed. Source parity false; runtime CSS overlay only. Rollback logoff-web:before-la-panthera-contrast.

Web `sha256:e0c20c3932d110e206e3e7c85748f2dcca61193029e542d6657ad1765258f20d`; API `sha256:a83204a8bb4819193a11ba7ba8a3b462c960ef772fc9d659c88a122dfd531f62`.
Baseline `2026-09-28-la-panthera-contrast`.

## Previous release

# Published PR375: archive empty FBO boxes / 28.09.2026

API `sha256:a83204a8bb4819193a11ba7ba8a3b462c960ef772fc9d659c88a122dfd531f62`. Two-module overlay on PR372; web/APK216, configuration, other containers and previous flags preserved. `WMS_FBO_EMPTY_BOX_ARCHIVE_ENABLED=true` only for our WMS. After individual FBO picking and shipment history capture, genuinely empty active boxes are archived and detached from pallet-sort in the same transaction. Permanent boxes, nonzero balances, marks and active bindings remain protected. Default/sold behavior unchanged.

Validation: API2915 passed,113 skipped; separate KIZ integration suite unavailable. TypeScript passed. Eight regression/guard tests. Actual candidate processed12 PALET_SORT_141 boxes with idempotence, then rolled back; original12 active boxes and placements verified. After publication, these exact12 boxes were archived in a Serializable transaction with fresh scope/stock/mark/task checks and audit records. No stock/KIZ/history mutation. Before-state backup `/opt/logoff-wms-releases/dovoz-relabel-20260917/pallet141-before-archive.json`. Post-commit12 archived and0 placements verified. Runtime hashes/health verified.

Baseline `2026-09-28-fbo-empty-boxes` is API-only with web hash metadata; retain current web independently. Source parity remains false. Rollback image d5038358 / `logoff-api:before-fbo-empty-box-archive`; rolling back code does not undo audited box archival.

## Previous release

# Published PR374: la_panthera / 28.09.2026

PR374: opt-in la_panthera web theme with self-hosted Inter (SIL OFL), graphite panels and violet accents. Existing section layout retained. Android, printing, Excel, API image and other containers unchanged. Full web274 tests, TypeScript and actual runtime graph/browser/font loading passed. Public index, entry, CSS, WOFF2 and license hashes verified. Source parity false; source-reference remains historical. API runtime captured from verified PR372 snapshot. Rollback: logoff-web:before-la-panthera.

Web `sha256:5cee65f8c9b91255ee1beb174ef3c232942dfa51559d22c8e457181da47ca570`; API `sha256:d503835845d4684bb5388552dc9304aa4cfd61e71b40bb3f1b393247bc8a9b2c`.
Baseline `2026-09-28-la-panthera`.

## Previous release

# Published PR372: bounded FBS assignment retries / 28.09.2026

API `sha256:d503835845d4684bb5388552dc9304aa4cfd61e71b40bb3f1b393247bc8a9b2c`. One-method overlay on live OpenClaw image51484e2; all other runtime files preserved. `WMS_FBS_ASSIGNMENT_BUSY_GUARD_ENABLED=true` only for our WMS. Busy employee/device requests return Conflict without releasing the active lock or accumulating retries. The original operation is not forcibly cancelled; its historical hang remains unproven. API restart during publication cleared in-memory pending requests.

Validation: 2907 API tests passed, 113 skipped; dedicated KIZ database suite excluded. TypeScript and actual candidate enabled/disabled, exclusion and recovery tests passed. After publication the device-context request for Marifat returned the correct closed-request response for1508 in107ms. Physical open-request picking remains to be confirmed on TSD. No stock or KIZ changes; web, APK216, configuration and other containers unchanged. Sold WMS untouched. Rollback image51484e2 / tag `logoff-api:before-marifat-assignment-wait`.

Baseline `2026-09-28-fbs-assignment-wait` captures API runtime and records web hashes without a web archive; retain current web independently. Source parity remains false.

## Previous release

# OpenClaw опубликован 28.09.2026

Наша WMS: [PR355](https://github.com/Maxhead2011/wmsFF/pull/355),
[PR363](https://github.com/Maxhead2011/wmsFF/pull/363),
[PR366](https://github.com/Maxhead2011/wmsFF/pull/366), база `feature/wb-print-check`.
API image `sha256:51484e2ea51ba0ea5594fd0dcd741cfdd2363681fbe7f33333191ae8c93c09b8`.
Web нашего выпуска `sha256:cdaa134f2f0806b28310ae7ec872f7104840967042cfbbb2218beb7b3d36c019`;
последующее оформление уже дало web `sha256:912149dad82a9c0683326f4a66a797b077b65a6fd9e34b9ab3f33f0743ec43cf`.
В последнем web сохранены entry `openclaw-20260928-0.js`, новый помощник и его маршруты.
Перед следующим выпуском заново считать фактические image ID.

OpenClaw 2026.9.6, Node 24.19.0, модель `openai/gpt-5.6-sol`, ChatGPT/Codex OAuth.
Сервис `wms-openclaw` включён при загрузке. API получает приватную конфигурацию из
`/etc/wms-openclaw/wms-api.env`; доступ разрешён действующим владельцам и администраторам.
Прокси применяется только к OpenClaw. Firewall разрешает 18789/tcp только через мост
нашей сети `infra_default` из 172.18.0.0/16 к 172.18.0.1. Публичного слушателя нет.

Проверено через работающий API: задание `d8293e10-adb1-466f-95ec-4a700c4f4c85`
завершено `DONE`, команда выполнена один раз, повтор requestId вернул тот же ответ.
Клиенту отказано 403, прежнему чату — 409. Временные проверочные сессии закрыты.
Первое сетевое задание осталось UNKNOWN без повторения; файл им не создан.

Снимок API содержит 554 файла. `sourceParityVerified=false`: полная пересборка
не разрешена. Проверенный локальный снимок:
`C:/WMSFF2207/baselines/openclaw-published-20260928`.
Серверный снимок и отчёты:
`/opt/logoff-wms-releases/openclaw-wms-20260928/published-baseline`,
`published.json`, `end-to-end.json`. Для следующего кандидата применять
`release_baseline.py --baseline <этот снимок>` и сверять свежий image ID.
Предыдущие снимки ниже являются историей.

Тесты актуальной интеграционной базы: API 2905 passed / 113 skipped, web 280 passed, 6 Node и 11 Python проверок,
TypeScript web и изолированный серверный кандидат. KIZ integration suite требует
выделенную тестовую БД и не запускался на production. Резервные образы:
`logoff-api:before-openclaw-20260928`, `logoff-web:before-openclaw-20260928`.
Поздний откат не должен затирать последующие выпуски интерфейса.

# Published PR364: cabinet loading / 28.09.2026

API `sha256:2c5e58b7d57ac148e1bb8e6068c305b52679210eba74a68f8d2401da8a6a5ea2`; web `sha256:ebd933aef735ee17d2721121a939c715797c14c7e958fbdd7f1abff9f9cc358c`.

Published PR364: cabinet-only compact stock projection and issued/paid invoice list without unused charge metadata. Product display settings expanded above branch tiles and all-client overview; loading/errors visible. Same database snapshot confirms identical balance quantities and visible invoice totals/payments/items. Stock payload 74.7MB to7MB, invoice50.9MB to1.4MB; server6.5s to4.1s and6.7s to0.33s respectively. API2872/web271 passed;113 API tests skipped. Four runtime API modules only; latest Spirit CSS, other assets, flags, APK216 and other containers preserved. Sold WMS untouched. Source parity false.

Baseline `2026-09-28-cabinet-fast`.

## Previous release

# Published PR358: client product display / 28.09.2026

API `sha256:09a4f4cc84a4ad1bb08279f8c2c236ab679accf7f1a50131c8e990647cd10cfb`; web `sha256:d204e622e626f793f63d733fa9efea41e701f3f77d2e10a506f8c8a138c83d59`.

Published PR358: per-client selection of name, article, barcode, size and color in assembly/packing WMS and Android TSD. Default behavior retained until explicitly configured. WMS_CLIENT_PRODUCT_DISPLAY_ENABLED=true only on our WMS. SystemSetting storage, no migration or preference writes during release. Raw scanner fields, cached plans, print labels and Excel unchanged. API2868/web266/Android220 passed; API113 skipped. Runtime and browser graph checks passed; APK216 signature matches215 and DEX checks passed. Public assets/APK, exact API/web hashes, settings read and unauthenticated HTTP401 verified. Sold WMS and other containers untouched. Source parity remains false; source reference historical. Physical TSD interaction pending.

Baseline `2026-09-28-client-display`.

## Previous release

# Published PR356: weekly inventory review / 28.09.2026

API `sha256:882d31805242c776406f5f9fb8ed7e6887a33b07be9343c9abe14457dcc89c6c`; web `sha256:0c52bd5273ae6e32eaeefe356bcb71e6440e3e266e3b50a4f21815ef01b6eba2`.

Published PR356: inventory default reads bounded to seven days under the existing our-WMS physical-resolution flag; exact-ID historical access and global full-inventory movement lock retained. Both live admin reconciliation and legacy FBS queries are bounded. Audit error details identify SKU/counts and conflicting physical KIZ identities. Quick lookup hides zero-balance locations. API delta is two files against payroll352; web delta preserves the newer Spirit warm build e764be7 and consistently renames its shared module graph to avoid a second React runtime. All other runtime hashes, old web assets, APK215, flags, config and other containers unchanged. No operational data writes or new migration. API2884/web265 tests and TypeScript passed; 113 skipped, dedicated KIZ integration DB unavailable. Eight runtime flag combinations and nine browser notification/navigation scenarios passed. Published read-only dashboard plus detail checks took 798ms. Source parity remains false; source reference is historical, not a complete build source.

Baseline `2026-09-28-inventory-weekly`.

## Previous release

# Published PR352: payroll corrections / 28.09.2026

API `sha256:edaec90e3b3b9e777c0dc9d4f3083a4ad9fe60036a454c6e0022f016b629797b`; web `sha256:c958929305d4139a6f884cd2f6742a598c2cb307701d36a613aef01505e7a04e`. Shift time/lunch editing, audited cancellation, initial employee rates. Additive migration and generated Prisma Client deployed. Spirit PR350/351, KIZ PR348, FBS, flags and APK215 preserved. Exact runtime/public asset hashes and health verified. Candidate migration/CRUD checked in isolated database. API2899 passed/94 skipped, dedicated KIZ database suite excluded; web260 passed. Dark physical camera capture remains unresolved; APK unchanged.

Baseline `2026-09-28-payroll352`; source parity false. Live Prisma schema captured separately. Old API ignores cancelled shifts: rollback after user cancellations requires reconciliation.

## Previous release

# Published PR348: sorting KIZ review / 28.09.2026

PR348 опубликован 28.09.2026. API `sha256:9a3ec430469e30afeb1620b1a75852815976eba477325d5c06fcb9778313a9a9`. Только два модуля КИЗов; WMS_KIZ_SORTING_ADMIN_REUSE_ENABLED=true. Web, APK, остальные контейнеры и настройки сохранены. 30 runtime-тестов passed, точные хеши и health проверены. Read-only проверка рабочего API подтверждает поступление КИЗа заявки1494 через сортировку после прежней отгрузки. Разрешение администратора и физический повторный скан ещё не выполнялись. Source parity всей системы остаётся false.

Baseline `2026-09-28-kiz-sorting`.

## Previous release

# Published PR346: handling review / 27.09.2026

API `sha256:12fa527baadc9a49bee0422932e49311dd96f2a8ddc32cbc4a34f0a18af92f38`; web `sha256:a0d4dec5f81901fee35ffa90533051b2610fd5c6a53e39deed1062b4e439df86`. One-off operation tariff, correction/cancellation of REVIEW handling and employee activity filter. No migration; previous flags and APK215 unchanged. PR345 waves retained. Verified exact runtime hashes, public web assets, health and candidate transaction rollback. Tests: API2894 passed/94 skipped (dedicated KIZ duplicate suite excluded), web255, Android72, TypeScript and Android lint. Attendance APK0.2.2 built; physical UI validation pending. Baseline `2026-09-27-handling346`; source parity remains false.

## Previous release

# Published PR343: tablet attendance / 27.09.2026

API `sha256:d67de6f69a8ebd5902a913be8662f67ab0e79b6c8d775dc9987bcf8ea13b8c90`; web `sha256:597d5e296a51dcbf0d353321461255d3c55e4b8de0225f2732afdbfaf955e71b`. FOT settings: device registration, photo requests and disputed marks. Additive Attendance migration; device flag enabled only on our WMS. API2885, web248, Android72 tests passed; 94 API tests skipped and dedicated KIZ DB suite excluded. Candidate registration/shift/photo-request/revocation verified with rollback on server DB; exact deployed hashes and HTTP assets verified. APK215 unchanged; attendance0.2.1 installed by user, camera pending physical verification. Baseline `2026-09-27-attendance343`; source parity remains false.

## Previous release

# Published PR341 (27.09.2026): own ADMIN/OWNER ACCEPT_AS_IS now permits FBS continuation when the privileged picker personally accepted unchanged system stock. API `sha256:dbc95e8faadbb7188e4637a41ef95b55d336977ea1e7f02367f33f455570afc0`; baseline `2026-09-27-admin-accept-audit`. Existing our-WMS flag only; two runtime modules (validator and authenticated-role call-site). Saved BOX294 acceptance passed read-only on candidate and production; WORKER rejected. API2870, web247, TypeScript passed; 97 skipped, dedicated DB suite unavailable. Stock, KIZs, web, APK215 and other containers unchanged. Source parity false. Rollback `logoff-api:before-admin-accept`.

## Previous release

# Published PR339: completed FBO history / 27.09.2026

API `sha256:487a1cb0235e22d037643835be01f9e320243a9f97949d80b2a185afc06368f5`. Historical PACKED units of COMPLETED FBO no longer block an administrator recount; explicit active bindings remain protected. One runtime module changed; all flags, web and APK retained. API2860, web247, TypeScript passed; full current BOX_0222 confirmation with five KIZs verified on the published image and rolled back. No recount required for the saved 18:45 scans. No history/billing mutation. Baseline `2026-09-27-completed-fbo-history`; source parity false. Rollback `logoff-api:before-completed-fbo`.

## Previous release

# Published PR337: administrator physical KIZ confirmation / 27.09.2026

API `sha256:8d84800a7dbc197451799055bb3b0659dd1dd1a0f57b94cbf3e7963c7f8fc921`. Opt-in `WMS_INVENTORY_PHYSICAL_RESOLUTION_ENABLED=true` only on our WMS. Two inventory modules changed; all other runtime files, existing flags, web and APK215 preserved. Confirmed old registration conflicts can be corrected without duplicate destination stock; current assembly and newer-movement guards remain. API2859, web247, TypeScript and two real-data rollback checks passed. Baseline `2026-09-27-admin-physical-kiz`; 544 API files and 413 web files verified. Source parity remains false. Rollback: `logoff-api:before-admin-physical-337`. No migration.

## Previous release

# Published PR334: payroll employee card / 26.09.2026

API unchanged: `sha256:91f592f9ea0420cecefd508b0c3bf64c9ffc1385d35070fe3d601a3832896cd6`. Web: `sha256:f71d461f6762387b3ef16471e0862daf0bda734e4ee76b530a86e9026007bd64`.
Independent settings selection; card opens in view mode with edit/save/cancel. Current rates and individual conditions shown independently of report dates. Web246 tests, TypeScript and actual overlay browser checks passed. Exact live API/web/APK/flags verified. Baseline `2026-09-26-payroll-card`. Source parity remains false. Rollback web: `logoff-web:before-payroll-card`. No API/database/APK changes.

## Previous release

# Published PR332: payroll editor, dates and sorting / 26.09.2026

API: `sha256:91f592f9ea0420cecefd508b0c3bf64c9ffc1385d35070fe3d601a3832896cd6`. Web: `sha256:693a0d1f72469302bd77233790260e31de44a9621a9411c19cdf335930342f57`.
Employee card/rate isolation, explicit save messages, all-staff sorting and dd.mm.yyyy in UI/exports. Web245, API2844 passed/97 skipped; KIZ integration suite excluded because its local DB is not configured. TypeScript/build and actual candidate browser/export checks passed. Exact live API/web/APK/flags verified. Baseline `2026-09-26-payroll-editor`. Source parity remains false. Rollback web: `logoff-web:before-payroll-editor`. Single API export delta; APK unchanged. Imported 17 September handling operations / 30750 RUB with payment REVIEW; historical hourly entries preserved.

## Previous release

# Published PR330: payroll payment summary / 26.09.2026

API unchanged: `sha256:a9684a191ca599ba7180c769fc5d33e9583af885ff794426c7d4765d9117cb7f`. Web: `sha256:e9dcce013f1ca121d7c05ca2a89e7a91175bda42c65c2b7e1d0bce96481065c4`.
Employee name, period amount and payment phone/bank shown together; paid/unpaid/review distinguished. Web244 tests, TypeScript and browser fixture passed. Exact live API/web/APK/flags verified. Baseline `2026-09-26-payroll-payment-summary`. Source parity remains false. Rollback web: `logoff-web:before-payroll-payment-summary`. No API/database/APK changes.

## Previous release

# Published PR328: FOT navigation and corrections / 26.09.2026

API `sha256:a9684a191ca599ba7180c769fc5d33e9583af885ff794426c7d4765d9117cb7f`.
Web `sha256:33e9a07f126cbccc9804ea1af0e270175d1c8d1829063df629233ad5940f6097`.
Standalone FOT submenu, back navigation, explicit manual entry, start/end columns and audited editing of historical/manual times. Paid records must be reviewed before correction. No migration or historical data changes. Verified 31 cards, 1263 rows, total 354401550 kopecks; PDF/Excel and branch isolation passed. API2844 passed/97 skipped, web242, TypeScript and browser regression checks passed. APK215 unchanged.
Baseline `2026-09-26-payroll-navigation`; source parity remains false. Rollback: `logoff-api:before-payroll-navigation`, `logoff-web:before-payroll-navigation`.

## Previous release

# Published PR326: ФОТ / 26.09.2026

API `sha256:9228a39f63d7ea929418635d9b1564cacb560a18eae8b2b00d47def3720d7a53`.
Web `sha256:21fab23236192311d421c4ae8bf170a32caee99c6e9aa2ce58d4f004ba3bbc15`.
New workforce module enabled only on our WMS. Additive migration `20260926150000_payroll_attendance`. Imported 1263 historical rows into ФФ Москва, total 3,544,015.50 RUB; August row48 excluded, name aliases pending. All monthly totals reconciled. API2841 passed/97 skipped, Web240, TypeScript, browser and runtime/export/access checks passed. APK215 and other containers unchanged.
Baseline `2026-09-26-payroll`; source parity remains false. Rollback images: `logoff-api:before-payroll-attendance`, `logoff-web:before-payroll-attendance`. Rollback retains new payroll data/tables.

## Previous release

# Published PR323: turnover / 26.09.2026

API `sha256:1ce3f6acbfd09b562fcf48bd7a57cda6d6208c1f8f051e8baad8e5dbf413029f`.
Web `sha256:3695f20eab55822b447412a77adf06be31bec7ee229ed65b8daa0434d48358fd`.
Relabel/recount proof without duplicate deduction; no automatic full-history load and stale responses ignored. APK215, flags, database and other containers unchanged. API2815 passed/94 skipped, Web238, TypeScript passed; runtime delta and public hashes verified. Baseline `2026-09-26-relabel-close`; source parity remains false.
Rollback: `logoff-api:before-turnover-relabel`, `logoff-web:before-turnover-relabel`.

## Previous release

# Published PR321: turnover / 26.09.2026

API `sha256:16ed6b5fb0440b41b1093e6ae4748e486feffad7b9185e8c53b41cc45933a326`.
Web `sha256:d6cd84011bca7995d92eabd27785c16fd71d3549e6ca1e64e46fedba74f31b05`.
Boxless deduction, archived current-stock exclusion, independent stock/statistics loading. APK215, flags, database and other containers unchanged. API2806 passed/94 skipped, Web236, TypeScript passed; runtime delta and public hashes verified. Baseline `2026-09-26-turnover`; source parity remains false.
Rollback: `logoff-api:before-turnover-321`, `logoff-web:before-turnover-321`.

## Previous release

# Published PR319: direct FBS reserved box route

API `sha256:e86c2e3beee1fcee76e5833a45c9c572338be740156501d01470a1a0881d75a2`. Published 25.09.2026 23:33 MSK.
Only tsd-assembly.service.js changed; environment, web and APK215 unchanged.
Request 1368 / order 5864079913 verified against real instruction: 1 unit, FFL_LKB0909_356, PALET_SORT_140.
2801 API tests passed, 94 skipped; TypeScript and four candidate route tests passed.
Baseline `2026-09-25-direct-route`; sourceParityVerified=false. Rollback `logoff-api:before-fbs-direct-route-319`.

## Previous releases

# Current published release PR317: bounded FBS box scans

API `sha256:45d6c29e16eb49035603749f58ef0272fa3e414eea269a5ee3f0a7f9bbe4acf4`. Published 25.09.2026 22:25 MSK.
`WMS_FBS_BOX_SCAN_BOUNDED_ENABLED=true`; all other environment and containers unchanged. Web/APK215 retained. Baseline `2026-09-25-fbs-box-scan`; sourceParityVerified=false. Runtime hash set and health verified. Rollback: `logoff-api:before-fbs-box-scan-317`.

## Earlier releases

# Current published release PR315 / LOGOFF215

API `sha256:a72064a45a06563f59e1051dbf1feddec037683685fb9f73dc061c3f3c58d00f`.
Web `sha256:a70b61112fc7c03ba29eacb86ccc249c6ec7dfb16b34fca3dd8e5c432c05d756` (public site preserved, APK downloads only).
APK215 SHA256 `405e13998427f8dd2b24f03d7cb89d99997a3eba9410486fe21f4a6cd11e38fd`.
Baseline: `2026-09-25-ozon-lines`. Migration applied; `WMS_OZON_MULTILINE_PICKING=true` only on our WMS. 46 runtime tests; public hashes and health verified. Terminal installation not verified. Source parity remains false.

## Historical releases

# Current published release PR313: light public website / APK214 unchanged

Web image: `sha256:41c8224ac636afde20e72e3123d640093ada1e447e3af43d1f9f74000709cde3`.
API remains `sha256:57c41c094bf9e3e45eea8adca8e7d666b17cc2f24432b52cbb149b6e1c5f2cf6`.
Only the external MarketingLanding component changed. All pre-existing public
assets/downloads retained; operational JS unchanged except consistent versioned ESM URLs.
Public page, mobile menu and login entry verified. 234 web tests, TypeScript,
7 release guard tests passed. API container and APK unchanged.
Web overlay: `baselines/our-wms/2026-09-25-public-site-light`; combine with the
PR311 web baseline, never replace current web with the earlier archive alone.
API baseline remains `2026-09-25-fbs-display`; sourceParityVerified remains false.
Rollback image: `logoff-web:before-public-light-20260925`.

## Previous published release PR311 / APK214

API sha256:57c41c094bf9e3e45eea8adca8e7d666b17cc2f24432b52cbb149b6e1c5f2cf6
Web sha256:475778f6b2d1fd9b51378d9c0db682d2f0f8345acfb69c64451cc4beedb4c18f
APK214 de67aee47f3f419e8e89e4a4a13974f945f988d9bd58bb51a4fd6e7261e771aa

Historical release notes below. Current baseline: 2026-09-25-fbs-display.

# Current release: PR309, 25.09.2026

[PR309](https://github.com/Maxhead2011/wmsFF/pull/309), merge adb8d2ca. Bounded 30-second inventory confirmation. Six runtime tests; API 2761 passed / 94 skipped. All previous KIZ and printing changes retained.

# Опубликованная база нашей WMS

Обновлено **25.09.2026 после PR307**. Интеграционная ветка `feature/wb-print-check`.
[PR307](https://github.com/Maxhead2011/wmsFF/pull/307), merge `3c20d0e5`.
Это привязка точечного выпуска, а не заявление о полном совпадении исходников с runtime.

| Компонент | Фактическая версия |
| --- | --- |
| API image | `sha256:edaed8c4b41b55a5cda87a4590dc0b32d5a6f2e667ed0627e22e0f3137426444` |
| Web image | `sha256:5bdcb162e03f2539795b379bcdc6644888e07fc7dcdbfc9456ed93c254a5193d` |
| Android LOGOFF | `213 / 0.1.213-relabel-external-print` |
| APK SHA-256 | `2537deeaa0079d3cf121132e1d42efff32c7e5e636f1e40509e144ee8ff8a295` |

PR307 меняет только три модуля КИЗов: отменённая принятая поставка допускает решение администратора при неизвестном погашении. Продажа и погашение блокируются. Проверки: 18 runtime, API 2763 passed / 92 skipped; DB-интеграция исключена. Остальные файлы после PR305 сохранены по хешам.

Текущий [снимок](../baselines/our-wms/2026-09-25-fbs-display/README.md) сохраняет
последний выпуск с маршрутом WMS к исходному коробу и восстановленной печатью.
В промежуточном API `be2a182a...` снова потерялись функции PR302 и маршруты/DI
переклейки. PR305 восстановил три файла, остальные 530 файлов API и весь web
оставлены без изменения. APK 213 не пересобирался. Старые снимки сохранены.

Проверки PR305: API 2761 passed / 94 skipped (kiz-duplicate.integration исключён
без тестовой БД), runtime 33, baseline guard 8. Health и wiring работающего
контейнера проверены, станция 2409 онлайн. Новая физическая печать после PR305
пока не подтверждена. [Описание](releases/relabel-regression-after-213/README.md).

PR302 восстановил потерянные вызовы контекста и очереди печати переклейки, а также
закреплённую пятёрку Лукина. APK 213 разрешает скан нового ШК без ACK станции.
ADMIN/OWNER видят все заявки. Текущая пятёрка не пополняется до полного завершения.

Проверки PR302: API 2754 passed / 94 skipped; DB-dependent kiz-duplicate.integration
не запускался без тестовой БД. Android LOGOFF 216, FFULLHAB 216; runtime 26;
baseline guard 8. Подпись APK совпадает с 212, health и публичные хеши проверены.
**Сборка 213 принята пользователем 25.09.2026:** «все заработало, проверили на трех
последовательно обновленных тсд». Это успешная отправная точка для следующих
изменений нашей WMS. Подтверждение относится к проверенному рабочему сценарию,
а не ко всем возможным функциям системы.
[Детали и состав исправления](releases/relabel-print-runtime-context/README.md).

## Что подтверждено

- Пользователь после PR300: «озон работает корректно».
- Реальный контейнер: capability нового ТСД проходит через 9 действий сборки.
- Проверка артефакта: ответ Ozon без вызова загрузчика наклейки, счётчик единиц,
  блокировка преждевременного завершения; сохранена последовательная сборка WB.
- Android: 215 тестов; API: 2750 прошли, 94 пропущены; web: 227 прошли;
  runtime: 12 проверок. Пропуски не считаются успехом. БД-интеграции требуют
  отдельной тестовой БД. Эти результаты относятся к PR300.
- Настройки `WMS_TSD_PHYSICAL_PICK_CONFIRMATION`, `WMS_OZON_TSD_UNIT_SCANS`,
  `WMS_FBS_SEQUENTIAL_PICK_ENABLED` включены. Полный список **булевых** WMS-флагов
  находится в манифесте; секретная конфигурация туда не включена.

## Что ещё не сведено

`sourceParityVerified=false`. Историческая сверка перед PR302 показала:

| Слой | Только на сервере | Только локально | Различаются | Совпадают |
| --- | ---: | ---: | ---: | ---: |
| Активные TypeScript-файлы API | 80 | 14 | 52 | 398 |
| API runtime относительно локальной сборки | 80 | 11 | 46 | 407 |

Контейнерные исходники также не равны исполняемому коду автоматически.
Веб/Android исходники не объявляются воспроизводимыми по одному номеру версии.
Схемы и миграции сохранены как файлы; состояние применения миграций в БД этим
снимком не подтверждается. Снимок не является резервной копией БД или Docker image.

Следующие изменения начинают с сохранённого runtime и явно проверяемого изменения
нужных файлов. Для перехода к полной сборке из TypeScript нужно отдельно переносить
и тестировать расхождения по модулям; массовая подмена текущих исходников серверной
папкой не выполнялась. Проверка состава выпуска ловит потерю файлов, но не заменяет
поведенческие тесты внутри намеренно изменяемого файла.

Проданная WMS не обследовалась и не обновлялась. У неё отдельная база и конфигурация.
