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
- `GET/POST /api/v1/skus` - карточки SKU и основной barcode.
- `GET/POST /api/v1/warehouse/warehouses` - склады.
- `GET/POST /api/v1/warehouse/zones` - зоны хранения.
- `GET/POST /api/v1/warehouse/boxes` - короба клиента.
- `GET/POST /api/v1/warehouse/pallets` - паллеты клиента.
- `GET /api/v1/stock/balances` - текущие остатки по клиенту, SKU, коробу или barcode.
- `POST /api/v1/stock/transfers/box-to-box` - перенос количества SKU между коробами через ledger.
- `POST /api/v1/imports/stocks/preview` и `commit` - проверка и запись XLSX-остатков.
- `POST /api/v1/imports/logistics/preview` - проверка XLSX-тарифов логистики.

## Следующие этапы

- Offline-ТСД: Room, operation outbox, sync API, конфликтная очередь.
- Личный кабинет клиента: остатки, заявки, услуги, статусы.
- Сборка, batch picking, упаковка и отгрузка.
- Биллинг: услуги, тарифы, хранение за литр, счета, акты, оплаты.
- Логистика: импорт тарифов и предварительный расчёт.
- Интеграции: 1С и маркетплейсы.
- Редактор этикеток по аналогии с NiceLabel.
