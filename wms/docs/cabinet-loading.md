# Ускорение кабинета клиента

Исправление в fix/client-cabinet-loading для нашей ВМС. Проданную ВМС не публикуем.

Кабинет запрашивает view=cabinet для stock/balances и billing/invoices. DTO принимает только это значение. Остатки выбирают поля SKU для отображения и Excel без marketplacePayload. Счета исключают charge.metadata и заранее отбирают ISSUED/PAID — ровно те статусы, которые уже показывали кабинет и сводные карточки. Строки счетов, суммы, оплаты, описания и sourceKey сохранены. Полный API других разделов остаётся прежним; serviceCategory для облегчённого кабинета не рассчитывается и не нужен его экранам. Запрос с фильтром serviceCategory сохраняет полный режим.

Пять полей отображения теперь открыты в начале кабинета, перед плитками филиалов и таблицей клиентов. Загрузка и ошибка больше не скрывают форму молча. Отключённый feature flag сохраняет прежний fallback.

Изменены StockBalancesService.list, BillingService.listInvoices и их DTO, api.ts, ClientCabinetPanel и ClientProductDisplaySettings. Добавлены воспроизводящие API-тесты проекций и сохранения полного режима, веб-тесты доступности настройки. Тесты первоначально воспроизвели тяжёлые проекции и прошли после исправления.

Проверка runtime кандидата в read-only RepeatableRead транзакции, с точными переменными работающего контейнера: остатки 74690605 → 6959836 байт (6501 → 4114 мс), счета 50893026 → 1396678 байт (6725 → 330 мс). Видимые количества, свободные остатки, счета, строки/суммы и оплаты совпали в одном снимке. Это серверная обработка и несжатый JSON, не замер полного открытия в браузере пользователя.

API2872 passed/113 skipped, web271 passed, TypeScript API/web. Браузерная проверка реального module graph: открытая настройка, пять полей, сохранение, разделение клиентов, сохранение FBO. APK216 не меняется. Сохранены последние CSS сайта; полноценная замена локальным dist запрещена (sourceParityVerified=false).

Артефакты: D:/WMSFF/_Kof/work/cabinet-fast-release. Скрипты patches/browser в scripts/cabinet-fast-release. Публикация — через PR в feature/wb-print-check.

Published on our WMS through PR364. Verified baseline: `2026-09-28-cabinet-fast`.

Post-deploy authenticated HTTP checks returned 200 for cabinet balances, invoices and product-display settings. Under concurrent API CPU load (about400% across cores), balances still took24.5–27.9s, invoices2.2–3.1s, settings46–921ms. The same-snapshot service measurements above isolate payload changes and are not end-to-end production load times. Residual server contention remains; no stock synchronization jobs were disabled.
