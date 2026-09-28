# Настройка описания товара при сборке и упаковке

Подготовлено локально 28.09.2026 в `feature/client-product-display` от `c59e7b45`.
PR358 слит в `feature/wb-print-check` и опубликован на нашей ВМС. ТСД — APK216.

Перед работой сверены сайт https://wms.logoff.pro, работающие образы и паспорт PR356:

- API `sha256:882d31805242c776406f5f9fb8ed7e6887a33b07be9343c9abe14457dcc89c6c`.
- Web `sha256:0c52bd5273ae6e32eaeefe356bcb71e6440e3e266e3b50a4f21815ef01b6eba2`.
- Публичная APK215 совпала по SHA256 с baseline `2026-09-28-inventory-weekly`.
- `release_baseline.py verify`: пять артефактов проверены.

## Поведение

В кабинете выбранного клиента пользователь с `clients:write` открывает
«Отображение товара при сборке и упаковке». Можно выбрать наименование, артикул,
штрихкод, размер и цвет. Пустой выбор не сохраняется. «Использовать прежнее
отображение» возвращает существующие правила экранов. Настройка другого клиента
не меняется. Применение — следующий ответ/обновление экрана сборки или упаковки.

Хранение: `SystemSetting`, ключ `client.product-display.v1:<clientId>`, автор и
время обновления. Миграция не требуется. API проверяет права и клиентский scope.
Включение только флагом `WMS_CLIENT_PRODUCT_DISPLAY_ENABLED=true` в нашей ВМС.
При выключенном флаге API настройки недоступен, существующие ответы не меняются.

Область: активные экраны FBS/FBO ВМС и Android-ТСД, включая упаковку грузомест и
описание принятого товара онлайн-упаковки. Другие разделы, Excel, наклейки и
исторические печатные документы сохраняют свой формат. Номера заказов, коробов,
количества, КИЗ и инструкции проверки скана не относятся к скрываемым полям.

Отдельный `productDisplayText` добавляется только в разрешённые ответы сборки.
Исходные данные не переписываются; кешированный план клонируется. Клиент настройки
определяется по SKU, а для упаковки — по точной паре заявка/заказ. Неоднозначные и
несопоставленные записи сохраняют прежнее отображение. При недоступности настроек
успешная складская операция возвращает штатный ответ и предупреждение в журнале.

## Изменённые модули

- API: новые `modules/clients/product-display.*`, подключение в `clients.module.ts`,
  регистрация двух маршрутов в `administration-internal-api.service.ts`.
- Web: форма кабинета `ClientProductDisplaySettings`, функции API и
  `assemblyProductDisplay`; экраны `ClientRequestsPanel`, `FboProgress`,
  `FboTwoStagePanel`, `OrderAssemblyPanel`, `OzonFboPanel`.
- Android: модели FBS/FBO/Ozon и грузомест, `MainActivity`, `FboTwoStageScreen`.

Общие модули затронуты: при переносе в проданную ВМС флаг оставлять выключенным.
Без серверного поля новая APK сохраняет прежнее отображение. Печатные шаблоны,
расчёт остатков и обработчики сканов не менялись.

## Проверки и ограничения

- API: 2868 passed, 113 skipped; команда `vitest run --exclude '**/kiz-duplicate*.spec.ts'`.
- Web: 266 passed, TypeScript и production build.
- Android: 220 passed, сборка `assembleLogoffDebug`.
- Скомпилированный API: настройки, валидация, выключенный флаг, неизменность сканов
  и кеша; браузер: выбор пяти полей, сохранение, смена клиента без переноса настройки.
- DEX APK: вызовы методов отображения из реальных экранов FBS/FBO.
- Исходный прогон выявил устаревшие локальные Prisma-клиенты. После генерации из
  имеющихся схем проверки прошли; код пользователей/аналитики не изменялся.

Артефакты проверки: `D:/WMSFF/_Kof/work/client-product-display-build`, журналы
`D:/WMSFF/_Kof/work/client-product-display-*.log`. Серверные настройки и данные
не менялись. Проверка на физическом ТСД ещё не проведена.

Перед публикацией нужен свежий baseline и точечный кандидат API/web с сохранением
текущих серверных модулей: `sourceParityVerified=false` по-прежнему действует.
Полную локальную сборку нельзя просто заменить на сервере. Для ТСД потребуется
отдельный выпуск обновлённой APK; текущая опубликованная APK215 новое поле не читает.

## Кандидат выпуска PR358

Повторно сверены точные runtime-хеши PR356. Подготовлены шесть файлов API, точечные изменения четырёх веб-модулей с согласованным переименованием 29 модулей и APK216. Проверены подпись APK (совпадает с 215), DEX и неизменность остальных серверных файлов. Runtime и браузерные проверки кандидата прошли. Повторные API2868/web266/Android220 — passed, API113 skipped. Первый повторный вызов Vitest из корня ошибочно захватил неподходящие standalone-скрипты; штатный запуск из apps/api прошёл целиком.

## Публикация

Published PR358: per-client selection of name, article, barcode, size and color in assembly/packing WMS and Android TSD. Default behavior retained until explicitly configured. WMS_CLIENT_PRODUCT_DISPLAY_ENABLED=true only on our WMS. SystemSetting storage, no migration or preference writes during release. Raw scanner fields, cached plans, print labels and Excel unchanged. API2868/web266/Android220 passed; API113 skipped. Runtime and browser graph checks passed; APK216 signature matches215 and DEX checks passed. Public assets/APK, exact API/web hashes, settings read and unauthenticated HTTP401 verified. Sold WMS and other containers untouched. Source parity remains false; source reference historical. Physical TSD interaction pending.
