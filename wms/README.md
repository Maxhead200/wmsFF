# WMS LOGOFF

Новая WMS лежит в папке `wms`, чтобы не смешивать полноценный продукт с текущей статической заглушкой в корне репозитория.

## Что уже заложено

- `apps/api` - NestJS API, Prisma-схема, импорты XLSX, логистические тарифы, stock ledger, печать TSC и API для ТСД.
- `apps/web` - React/Vite интерфейс оператора/администратора с картой модулей.
- `apps/android-tsd` - Kotlin native skeleton для Android-ТСД.
- `infra` - Docker Compose, Nginx и скрипт бэкапа PostgreSQL.
- `docs` - архитектура, модули и созданные отдельные чаты по модулям.

## Локальный старт

```bash
cd wms
pnpm install
pnpm prisma:generate
pnpm test
pnpm dev:api
pnpm dev:web
```

## Production-идея

На VPS `wms.logoff.pro` разворачиваем `infra/docker-compose.yml`: Nginx принимает HTTPS, проксирует web и API, отдельно работают PostgreSQL, Redis и worker-процессы.

Секреты хранятся только в `.env` на сервере. В GitHub попадает `.env.example`, но не реальные пароли, токены и доступы.

Первичная выкладка на VPS:

```bash
cd /tmp
curl -fsSL https://raw.githubusercontent.com/Maxhead200/wmsFF/codex/wms-foundation/wms/infra/scripts/deploy-vps.sh -o deploy-vps.sh
sh deploy-vps.sh
```
