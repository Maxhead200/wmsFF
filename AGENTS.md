# Откуда начинать работу с нашей WMS

Текущий выпуск: PR323, 26.09.2026. API
`sha256:1ce3f6acbfd09b562fcf48bd7a57cda6d6208c1f8f051e8baad8e5dbf413029f`.
Baseline `2026-09-26-relabel-close`; цепочка переклейки/актуализации №1323 проверена без записи в БД.
Web обновлён: явный поиск товарооборота без фоновой полной истории. APK215 и флаги сохранены.

Единственная рабочая папка на этом компьютере — `D:\WMSFF\_Kof` и её подпапки.
Не использовать прежний каталог OneDrive. Продукт находится в `wms/` относительно
корня этого Git-репозитория. Временные файлы — в `D:\WMSFF\_Kof\work`.

Перед изменениями читать [индекс](wms/docs/README.md),
[текущий выпуск](wms/docs/current-production.md) и
[порядок выпуска](wms/docs/release-workflow.md).
Старая рабочая копия или успешная сборка исходников не являются доказательством
соответствия production. Проверять актуальный image ID перед каждым выпуском.

Для нашей WMS фактическая интеграционная ветка на 25.09.2026 —
`feature/wb-print-check`, а не `main` и не номинальная `feature/our-vm`.
Новые изменения — отдельная `fix/` или `feature/` от согласованной актуальной базы,
затем тесты и PR. Не пушить непосредственно в интеграционную/защищённую ветку.
Не переключаться на `main`/`master`. Конфликты не разрешать без инструкции пользователя.
Проданная WMS не входит в baseline `our-wms`; не переносить туда его файлы и флаги.

Перед правками перечислить файлы/функции и влияние на проданную WMS. Для багов
добавлять воспроизводящий автоматический тест, проверять его до/после исправления.
До коммита выполнять необходимые тесты; пропуски указывать отдельно.
Не расширять рефакторинг за пределы задачи.

При изменении FBS/переклейки/печати обязательно проверять одновременно:
передачу capability через контроллер, экран без наклейки заказа, счётчик Ozon,
последовательный отбор WB, отдельную печать целевого ШК. Тестировать фактический
собранный артефакт. Проверка только TypeScript уже пропускала регресс.

Снимок `wms/baselines/our-wms/2026-09-26-relabel-close` сохраняет runtime после PR323 (закрытие переклейки и поиск товарооборота; маршруты FBS и Ozon215 сохранены):
новый маршрут к исходному коробу сохранён, потерянная печать восстановлена.
Он не означает завершённого сведения TypeScript с runtime: `sourceParityVerified=false`.
Не заменять production полной локальной сборкой до отдельной сверки расхождений.
Проверка `release_baseline.py check-candidate` обязательна для выпусков от этого
снимка; при новой серверной версии сначала обновить проверенную базу.


Latest verified release: PR326, ФОТ. Baseline `wms/baselines/our-wms/2026-09-26-payroll`. API `sha256:9228a39f63d7ea929418635d9b1564cacb560a18eae8b2b00d47def3720d7a53`, web `sha256:21fab23236192311d421c4ae8bf170a32caee99c6e9aa2ce58d4f004ba3bbc15`. APK215 unchanged; WMS_PAYROLL_ATTENDANCE_ENABLED=true only on our WMS. Eight additive Payroll tables; historical import completed with August row48 excluded. Source parity remains false.


Latest verified release: PR328, payroll navigation and audited time corrections. Baseline `wms/baselines/our-wms/2026-09-26-payroll-navigation`. API `sha256:a9684a191ca599ba7180c769fc5d33e9583af885ff794426c7d4765d9117cb7f`, web `sha256:33e9a07f126cbccc9804ea1af0e270175d1c8d1829063df629233ad5940f6097`. APK215, flags and historical payroll records unchanged. Source parity remains false.

Latest verified release: PR330, payroll payment summary. Baseline `wms/baselines/our-wms/2026-09-26-payroll-payment-summary`. Web `sha256:e9dcce013f1ca121d7c05ca2a89e7a91175bda42c65c2b7e1d0bce96481065c4`; API/APK/flags unchanged. Source parity remains false.

Latest verified release: PR332, payroll editor, dates and sorting. Baseline `wms/baselines/our-wms/2026-09-26-payroll-editor`. Web `sha256:693a0d1f72469302bd77233790260e31de44a9621a9411c19cdf335930342f57`; API export module updated; APK/flags unchanged. Source parity remains false.

Latest verified release: PR334, payroll employee card. Baseline `wms/baselines/our-wms/2026-09-26-payroll-card`. Web `sha256:f71d461f6762387b3ef16471e0862daf0bda734e4ee76b530a86e9026007bd64`; API/APK/flags unchanged. Source parity remains false.

Latest verified release PR337 (27.09.2026): administrator physical KIZ resolution. Baseline `wms/baselines/our-wms/2026-09-27-admin-physical-kiz`; API `sha256:8d84800a7dbc197451799055bb3b0659dd1dd1a0f57b94cbf3e7963c7f8fc921`. Two inventory modules changed, WMS_INVENTORY_PHYSICAL_RESOLUTION_ENABLED=true only on our WMS. All other flags, web and APK215 preserved. Source parity remains false.

Latest verified PR339: baseline `wms/baselines/our-wms/2026-09-27-completed-fbo-history`, API `sha256:487a1cb0235e22d037643835be01f9e320243a9f97949d80b2a185afc06368f5`. Completed FBO history no longer blocks physical inventory confirmation. One runtime helper changed; flags/web/APK unchanged.


Published PR341 (27.09.2026): own ADMIN/OWNER ACCEPT_AS_IS now permits FBS continuation when the privileged picker personally accepted unchanged system stock. API `sha256:dbc95e8faadbb7188e4637a41ef95b55d336977ea1e7f02367f33f455570afc0`; baseline `2026-09-27-admin-accept-audit`. Existing our-WMS flag only; two runtime modules (validator and authenticated-role call-site). Saved BOX294 acceptance passed read-only on candidate and production; WORKER rejected. API2870, web247, TypeScript passed; 97 skipped, dedicated DB suite unavailable. Stock, KIZs, web, APK215 and other containers unchanged. Source parity false. Rollback `logoff-api:before-admin-accept`.

Latest verified release: PR343, tablet attendance. Baseline wms/baselines/our-wms/2026-09-27-attendance343. API sha256:d67de6f69a8ebd5902a913be8662f67ab0e79b6c8d775dc9987bcf8ea13b8c90; web sha256:597d5e296a51dcbf0d353321461255d3c55e4b8de0225f2732afdbfaf955e71b. New Attendance tables and sequence, WMS_ATTENDANCE_DEVICE_ENABLED=true only on our WMS. Previous flags and APK215 unchanged. API2885/web248/Android72 tests, server rollback smoke and runtime hashes passed; physical camera pending. Source parity remains false.

Latest verified release PR348: baseline `2026-09-28-kiz-sorting`; API `sha256:9a3ec430469e30afeb1620b1a75852815976eba477325d5c06fcb9778313a9a9`. Two KIZ modules only, sorting admin reuse flag enabled; other services preserved. 30 runtime tests and actual-unit read-only proof verified; physical scan pending.


Latest verified release PR356: baseline `wms/baselines/our-wms/2026-09-28-inventory-weekly`; API `sha256:882d31805242c776406f5f9fb8ed7e6887a33b07be9343c9abe14457dcc89c6c`, web `sha256:0c52bd5273ae6e32eaeefe356bcb71e6440e3e266e3b50a4f21815ef01b6eba2`. Weekly inventory review, descriptive KIZ errors, positive locations only. Existing flags and APK215 unchanged; sold WMS untouched; source parity false.


Latest verified release PR358: baseline `wms/baselines/our-wms/2026-09-28-client-display`; API `sha256:09a4f4cc84a4ad1bb08279f8c2c236ab679accf7f1a50131c8e990647cd10cfb`, web `sha256:d204e622e626f793f63d733fa9efea41e701f3f77d2e10a506f8c8a138c83d59`. Client product display for assembly/packing, APK216. Existing flags preserved; new display flag true only on our WMS; sold WMS untouched; source parity false.


Latest verified release PR364: baseline `wms/baselines/our-wms/2026-09-28-cabinet-fast`; API `sha256:2c5e58b7d57ac148e1bb8e6068c305b52679210eba74a68f8d2401da8a6a5ea2`, web `sha256:ebd933aef735ee17d2721121a939c715797c14c7e958fbdd7f1abff9f9cc358c`. Cabinet-only compact responses and expanded product display settings at the top. Existing flags and APK216 unchanged; sold WMS untouched; source parity false.


Latest verified web release PR374: baseline `2026-09-28-la-panthera`. Web sha256:5cee65f8c9b91255ee1beb174ef3c232942dfa51559d22c8e457181da47ca570; API sha256:d503835845d4684bb5388552dc9304aa4cfd61e71b40bb3f1b393247bc8a9b2c unchanged. la_panthera opt-in theme and bundled Inter. APK216/sold WMS unchanged; source parity false.


Latest verified web release PR377: baseline `2026-09-28-la-panthera-contrast`. Web sha256:e0c20c3932d110e206e3e7c85748f2dcca61193029e542d6657ad1765258f20d; API sha256:a83204a8bb4819193a11ba7ba8a3b462c960ef772fc9d659c88a122dfd531f62 unchanged. la_panthera opt-in theme and bundled Inter. APK216/sold WMS unchanged; source parity false.


Latest verified web release PR381: baseline `2026-09-28-la-panthera-complete`. Web sha256:97781c96c22ef56db57f31f301477b164cde4b525da76e8d5025e5cb19da16dc; API sha256:a83204a8bb4819193a11ba7ba8a3b462c960ef772fc9d659c88a122dfd531f62 unchanged. la_panthera opt-in theme and bundled Inter. APK216/sold WMS unchanged; source parity false.


Latest verified web release PR385: baseline `2026-09-28-panther-loader`. Web sha256:d6670224e2817dbcd893912ac1ae5ed773a10771b58c3dcec3278a026d2aae48; API sha256:a83204a8bb4819193a11ba7ba8a3b462c960ef772fc9d659c88a122dfd531f62 unchanged. la_panthera opt-in theme and bundled Inter. APK216/sold WMS unchanged; source parity false.


Latest verified release PR396: baseline `2026-09-29-request-batch-theme`. Web sha256:2262deb8564c040b6186b4c4016e738fd4cf7f56a1796d547a6b9ebc6fee7248; API sha256:7334f195b90d4d8e4f4915993974511c8ce49b3198f6a46569b0edabd799b2db. Request archive/bulk actions in all themes; navigation/visual changes opt-in la_panthera. APK216/sold WMS unchanged; source parity false.


Latest verified release PR400: baseline `2026-09-29-request-polish`. Web sha256:6fb21ea4193cd208c1a989ea81b41b87a1cba9ea928394738611091360c171c0; API sha256:277d5a2c9c5dc21acb28df6d4197688cdb81c4bbf3ca8db4290a5340d855986b. Request archive/bulk actions in all themes; navigation/visual changes opt-in la_panthera. APK216/sold WMS unchanged; source parity false.


Latest verified release PR402: baseline `2026-09-29-reconciliation-navigation`. Web sha256:e17e49f27e77dce52f86e18386cf8fc29d9bd3e1102e181ad059c00d036f1fc9; API sha256:277d5a2c9c5dc21acb28df6d4197688cdb81c4bbf3ca8db4290a5340d855986b. Request archive/bulk actions in all themes; navigation/visual changes opt-in la_panthera. APK216/sold WMS unchanged; source parity false.


Latest verified release PR404: baseline `2026-09-29-fbs-zone-colors`. Web sha256:95ef7bb7954cf2ff21060cfcd25f408b455158f41b97109ee09cc9b78086fa71; API sha256:277d5a2c9c5dc21acb28df6d4197688cdb81c4bbf3ca8db4290a5340d855986b. Request archive/bulk actions in all themes; navigation/visual changes opt-in la_panthera. APK216/sold WMS unchanged; source parity false.


Latest verified release PR406: baseline `2026-09-29-ordinary-pick-reviews`. Web sha256:299f32d7fb3eb66ab08bc4bb22bb870226cf3d9250e628ba03090ad658ea7034; API sha256:aba843bb78a45c4a1f06a25315f53210b8eaad6992d44f1bc02dfff97a8208e5. Request archive/bulk actions in all themes; navigation/visual changes opt-in la_panthera. WMS_FBS_UNMARKED_PICK_CLOSE_ENABLED=true only on our WMS; APK216/sold WMS unchanged; source parity false.


Latest verified release PR408: baseline `2026-09-29-compact-request-columns`. Web sha256:4d3bb184e13764d8bfbced614cb042986b24c4da16b1174e37889afc43c6f771; API sha256:aba843bb78a45c4a1f06a25315f53210b8eaad6992d44f1bc02dfff97a8208e5. Compact request columns in every theme; API and previous behavior unchanged. APK216/sold WMS unchanged; source parity false.
