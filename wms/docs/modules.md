# Модули WMS

## MVP

- Авторизация, пользователи, роли и права.
- Клиенты и ограничение доступа по клиенту.
- SKU, штрихкоды, габариты и литраж.
- Зоны, короба и паллеты.
- Приёмка, размещение, перемещения.
- Stock ledger, остатки и базовая инвентаризация.
- XLSX-импорт начальных остатков.
- Online Android-ТСД.
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
- `POST /api/v1/imports/stocks/preview` и `commit` - проверка и запись XLSX-остатков.
- `POST /api/v1/imports/logistics/preview` и `commit` - проверка и запись XLSX-тарифов логистики.
- `GET /api/v1/logistics/tariff-sets` - список загруженных наборов тарифов.
- `GET /api/v1/logistics/tariff-sets/:id` - набор тарифов с направлениями и ступенями.
- `POST /api/v1/logistics/quote` - предварительный расчет доставки по направлению и количеству коробов/паллет.

## Следующие этапы

- Расширение клиентских scope на личный кабинет и заявки клиента.
- Offline-ТСД: Room, operation outbox, sync API, конфликтная очередь.
- Личный кабинет клиента: остатки, заявки, услуги, статусы.
- Сборка, batch picking, упаковка и отгрузка.
- Биллинг: услуги, тарифы, хранение за литр, счета, акты, оплаты.
- Логистика: заявки на доставку, статусы рейсов и связь с биллингом.
- Интеграции: 1С и маркетплейсы.
- Редактор этикеток по аналогии с NiceLabel.
