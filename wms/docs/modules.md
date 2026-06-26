# Модули WMS

## MVP

- Авторизация, пользователи, роли и права.
- Клиенты и ограничение доступа по клиенту.
- SKU, штрихкоды, габариты и литраж.
- Зоны, короба и паллеты.
- Приёмка, размещение, перемещения.
- Stock ledger, остатки и базовая инвентаризация.
- XLSX-импорт начальных остатков.
- Offline Android-ТСД с локальным outbox.
- Серверная печать этикеток TSC.

## Реализованные API-срезы

- `GET/POST /api/v1/clients` - справочник клиентов.
- `POST /api/v1/auth/bootstrap` - первичное создание администратора по bootstrap secret.
- `POST /api/v1/auth/login` и `GET /api/v1/auth/me` - вход и профиль текущего пользователя.
- `GET/POST /api/v1/users` - администрирование пользователей с проверкой прав.
- `GET /api/v1/users/roles` - роли и разрешения WMS.
- `PATCH /api/v1/users/:id/client-scopes` - ограничение пользователя по клиентам и правам чтения/записи.
- Существующие API-модули закрыты через `@RequirePermissions()` по зонам `clients`, `skus`, `warehouse`, `stock`, `imports`, `logistics`, `print`.
- `GET/POST /api/v1/skus` - карточки SKU и основной barcode.
- `GET/POST /api/v1/warehouse/warehouses` - склады.
- `GET/POST /api/v1/warehouse/zones` - зоны хранения.
- `GET/POST /api/v1/warehouse/boxes` - короба клиента.
- `GET/POST /api/v1/warehouse/pallets` - паллеты клиента.
- `GET /api/v1/stock/balances` - текущие остатки по клиенту, SKU, коробу или barcode.
- `POST /api/v1/stock/transfers/box-to-box` - перенос количества SKU между коробами через ledger.
- `POST /api/v1/stock/fulfillment/pick-request` - первый слой сборки outbound-заявки: переводит доступный остаток из `AVAILABLE` в `PACKING` через `PICK`-движения ledger и ставит заявку в работу.
- `POST /api/v1/stock/fulfillment/package-request` - упаковка outbound-заявки: переводит собранный остаток из `PACKING` в `SHIPPING` через `PACK`-движения и ставит заявку в статус `PACKED`.
- `POST /api/v1/stock/fulfillment/ship-request` - финальная отгрузка outbound-заявки: списывает упакованный остаток из `SHIPPING` через `SHIP`-движения и закрывает заявку в `DONE`.
- `GET/POST /api/v1/client-requests` - клиентские заявки с фильтрацией по client scope.
- `GET /api/v1/client-requests/:id` и `PATCH /api/v1/client-requests/:id/status` - карточка заявки и изменение статуса внутренним workflow.
- `GET /api/v1/client-requests/:id/document` - печатный HTML-документ заявки с табличным составом, контактами, статусом и проверкой client scope на чтение.
- `GET/POST /api/v1/client-requests/:id/files` и `GET /api/v1/client-requests/:id/files/:fileId` - вложения клиентской заявки с хранением файла в PostgreSQL и проверкой client scope.
- `GET/POST /api/v1/client-notifications` и `PATCH /api/v1/client-notifications/:id/read` - уведомления клиентского кабинета, ручное создание менеджером и отметка прочтения клиентом.
- `POST /api/v1/imports/stocks/preview` и `commit` - проверка и запись XLSX-остатков.
- `POST /api/v1/imports/logistics/preview` и `commit` - проверка и запись XLSX-тарифов логистики.
- `GET /api/v1/logistics/tariff-sets` - список загруженных наборов тарифов.
- `GET /api/v1/logistics/tariff-sets/:id` - набор тарифов с направлениями и ступенями.
- `POST /api/v1/logistics/quote` - предварительный расчет доставки по направлению и количеству коробов/паллет.
- `GET/POST /api/v1/logistics/carriers` - справочник активных перевозчиков для рейсов доставки.
- `GET/POST /api/v1/logistics/trips` - рейсы доставки с перевозчиком, датой, машиной, водителем и списком назначенных доставок.
- `GET/POST /api/v1/logistics/delivery-requests` - заявки на доставку с фильтрацией по client scope и авторасчетом тарифа, если маршрут найден.
- `PATCH /api/v1/logistics/delivery-requests/:id/status` - управление статусами доставки: запрос, расчет, план, в пути, доставлено или отменено.
- `GET/POST /api/v1/billing/services` - справочник услуг биллинга с единицей и ценой по умолчанию.
- `GET/POST /api/v1/billing/charges` - ручные начисления по клиенту, услуге и заявке с расчетом суммы.
- `POST /api/v1/billing/charges/storage` - автоматическое начисление хранения по текущему литражу остатков за период.
- `PATCH /api/v1/billing/charges/:id/status` - перевод начисления в черновик, утверждение или отмену.
- `GET/POST /api/v1/billing/invoices` - счета по утвержденным начислениям клиента за период.
- `GET /api/v1/billing/invoices/:id/document` - печатный HTML-документ счета с позициями, оплатами и проверкой client scope на чтение.
- `GET /api/v1/billing/invoices/:id/act` - печатный HTML-акт оказанных услуг на основе снимка позиций счета.
- `PATCH /api/v1/billing/invoices/:id/status` - выставление, отмена и закрытие счета.
- `POST /api/v1/billing/payments` - фиксация оплаты по счету с пересчетом оплаченной суммы.
- `POST /api/v1/print/box-label/preview`, `sku-label/preview`, `pallet-label/preview` - preview TSPL-команд для коробной, товарной и паллетной этикетки.
- `GET/POST /api/v1/print/templates` - справочник TSPL-шаблонов этикеток с типом, размером и активностью.
- `POST /api/v1/print/templates/:id/preview` - preview сохраненного TSPL-шаблона с безопасной подстановкой переменных `{{variableName}}`.
- `POST /api/v1/print/templates/:id/jobs` - постановка готового TSPL из шаблона в очередь печати на указанный принтер.
- `GET /api/v1/print/jobs` и `PATCH /api/v1/print/jobs/:id/status` - список заданий печати и ручная смена статуса до появления печатного воркера.
- `GET/POST /api/v1/tsd/devices` - управление ТСД-устройствами и выдача одноразового device secret.
- `POST /api/v1/tsd/login` - вход ТСД по коду и секрету с выдачей device access token.
- `POST /api/v1/tsd/operations` - прием одной операции ТСД с идемпотентным ключом.
- `POST /api/v1/tsd/sync` - batch-синхронизация offline outbox ТСД; `move_scan` применяет перенос между коробами через stock ledger.
- `GET /api/v1/tsd/review` - очередь операций ТСД со статусом `NEEDS_REVIEW`.
- `GET /api/v1/tsd/review/history` - история ручных решений по конфликтам ТСД с оператором и комментарием.
- `PATCH /api/v1/tsd/review/:id` - ручное решение по операции ТСД: подтверждение inventory adjustment или отклонение.
- Android-ТСД хранит pending/rejected операции в Room, входит по device secret, повторяет pending batch и показывает оператору отклоненные операции.
- `receipt_scan` создает приход в короб через ledger, а `inventory_scan` с расхождением попадает в разбор и может быть подтвержден как `INVENTORY_ADJUSTMENT`.
- VPS deploy после успешных health-check чистит неиспользуемые Docker images/containers/build cache без удаления volumes PostgreSQL/Redis; возрастной фильтр включается через `DOCKER_PRUNE_UNTIL`.
- Web-интерфейс работает как операционный shell: левое меню по доступным модулям, выделенная шапка, рабочая область справа и подвал.
- Web-интерфейс отделяет клиентский кабинет от внутренних модулей: роль `CLIENT` видит клиентскую витрину, заявки, логистику и финансы без пустых админских панелей.
- Клиентский кабинет показывает остатки, активные заявки, счета, задолженность и начисления по доступному client scope.
- Клиентский кабинет и рабочие панели открывают печатные HTML-документы заявки и счета; документы можно скачать или открыть в отдельном окне для печати.
- Клиентский кабинет показывает уведомления по клиенту, умеет отмечать их прочитанными, прикладывать файлы к заявке и скачивать ранее загруженные вложения.
- Web-интерфейс показывает панель клиентских заявок: создание по writable client scope, список заявок и смена статуса при праве `client-requests:status`.
- Форма клиентской заявки поддерживает табличный состав до 100 позиций и вставку строк из Excel/CSV в формате `штрихкод;товар;количество;комментарий`.
- В таблице заявок оператор может последовательно запустить сборку, упаковку и отгрузку outbound-заявки; система ведет товар через `AVAILABLE -> PACKING -> SHIPPING -> SHIP` и сохраняет каждый этап в stock ledger.
- Web-очередь разбора ТСД умеет принять inventory adjustment или отклонить конфликтную операцию.
- Web-интерфейс показывает панель биллинга: создание услуг, ручные начисления, автоматическое хранение по литражу, счета, оплаты и статусы утверждения.
- Web-интерфейс показывает панель логистики: расчет тарифа, создание заявок доставки по клиенту/исходящей заявке, таблицу статусов и ручную проверку неоднозначных тарифов.
- Web-интерфейс показывает панель печати: фиксированные preview короб/SKU/паллета, редактор сохраненных TSPL-шаблонов и очередь заданий на принтеры.

## Следующие этапы

- Расширение клиентского кабинета: история услуг, комментарии по заявкам и настройка уведомлений по событиям.
- ТСД: расширенные причины отклонения и отображение принятого решения на Android-устройстве.
- Личный кабинет клиента: документы, файлы заявок, уведомления и детализация услуг.
- Batch picking, волновая сборка и детализация упаковочных мест поверх уже созданного слоя `AVAILABLE -> PACKING -> SHIPPING -> SHIP`.
- Биллинг: акты, детализация оказанных услуг и PDF-экспорт финансовых документов.
- Логистика: рейсы, автоначисление доставки в биллинг и детализация перевозчиков.
- Интеграции: 1С и маркетплейсы.
- Печать: версии шаблонов и фоновый воркер отправки очереди на конкретный принтер.

## Дополнение: автоначисление доставки

- `POST /api/v1/logistics/delivery-requests/:id/billing-charge` создает утвержденное начисление доставки в биллинге после статуса `DELIVERED`.
- `PATCH /api/v1/logistics/delivery-requests/:id/quote` фиксирует ручной финальный расчет доставки, снимает `requiresManualReview` и переводит новую заявку в `QUOTED`.
- `PATCH /api/v1/logistics/delivery-requests/:id/trip` назначает доставку в рейс, сохраняет `tripId`, подставляет плановую дату рейса и переводит новую заявку в `PLANNED`.
- `PATCH /api/v1/logistics/trips/:id/status` ведет операционный статус рейса: `PLANNED`, `LOADING`, `IN_TRANSIT`, `COMPLETED`, `CANCELLED`.
- Начисление получает источник `LOGISTICS`, уникальный `sourceKey=logistics-delivery:<deliveryRequestId>` и привязку обратно к заявке доставки.
- Повторный вызов не дублирует деньги: система возвращает уже связанную заявку с существующим начислением.
