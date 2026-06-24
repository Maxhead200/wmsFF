# LOGOff WMS

Первая рабочая версия WMS для фулфилмента LOGOff: Kotlin/Spring Boot backend, web/PWA интерфейс, API под `/api`, роли, клиентский кабинет, приемка, карантин товара без ШК, остатки, сборка поставок, инвентаризации, биллинг и обмен с 1С через файлы.

## Локальный запуск

```powershell
gradle bootRun
```

Открыть: `http://localhost:8080`

Демо-пользователи:

| Роль | Логин | Пароль |
| --- | --- | --- |
| Администратор | `admin` | `admin123` |
| Сотрудник склада | `sklad` | `sklad123` |
| Менеджер | `manager` | `manager123` |
| Бухгалтер | `buh` | `buh123` |
| Бухгалтер-таксировщик | `tax` | `tax123` |
| Клиент | `client` | `client123` |

## Docker

```powershell
docker compose up --build
```

Compose поднимает PostgreSQL, Redis и приложение на `8080`. В текущей версии сервис работает с seed/in-memory данными, а `src/main/resources/db/schema.sql` фиксирует базовую PostgreSQL-схему для следующего шага миграций.

## API v1

Основные группы API уже заведены:

- `/api/auth` — вход, текущий пользователь, регистрация-заявка клиента.
- `/api/users`, `/api/roles` — пользователи, роли и права.
- `/api/clients`, `/api/products`, `/api/barcodes`, `/api/stock` — клиентские карточки, товары, ШК и остатки.
- `/api/receipts`, `/api/quarantine`, `/api/tasks`, `/api/marketplace-supplies`, `/api/inventory-counts` — складские операции.
- `/api/services`, `/api/billing`, `/api/documents`, `/api/reports` — услуги, счета, акты, ПКО, отчеты.
- `/api/integrations/1c` — предпросмотр импорта и экспорт CSV для 1С.
- `/api/ui-settings` — видимость окон интерфейса по пользователю/роли.

## Проверки

```powershell
gradle test
```

Тесты покрывают вход, чтение dashboard, запрет клиенту складской приемки, перевод товара без ШК в карантин и создание счета бухгалтером.
