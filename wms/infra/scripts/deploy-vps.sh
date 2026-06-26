#!/usr/bin/env sh
set -eu

# Русский комментарий: скрипт выполняется на VPS и подтягивает свежий код из GitHub.
APP_DIR="${APP_DIR:-/opt/logoff-wms}"
BRANCH="${BRANCH:-codex/wms-foundation}"
REPO_URL="${REPO_URL:-https://github.com/Maxhead200/wmsFF.git}"
COMPOSE_DIR="$APP_DIR/wms/infra"
ENV_FILE="$APP_DIR/wms/.env"
HOST_NGINX_AVAILABLE="/etc/nginx/sites-available/wms.logoff.pro"
HOST_NGINX_ENABLED="/etc/nginx/sites-enabled/wms.logoff.pro"

if ! command -v git >/dev/null 2>&1; then
  apt-get update
  apt-get install -y git
fi

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
fi

if [ ! -f "$ENV_FILE" ]; then
  DB_PASSWORD="$(openssl rand -hex 18)"
  JWT_ACCESS="$(openssl rand -hex 32)"
  JWT_REFRESH="$(openssl rand -hex 32)"
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
API_PORT=3000
WEB_PORT=5173

POSTGRES_DB=wms
POSTGRES_USER=wms
POSTGRES_PASSWORD=$DB_PASSWORD
DATABASE_URL=postgresql://wms:$DB_PASSWORD@postgres:5432/wms?schema=public

REDIS_URL=redis://redis:6379
JWT_ACCESS_SECRET=$JWT_ACCESS
JWT_REFRESH_SECRET=$JWT_REFRESH

PUBLIC_API_URL=https://wms.logoff.pro/api/v1
EOF
fi

cd "$COMPOSE_DIR"
docker compose --env-file ../.env build
docker compose --env-file ../.env up -d postgres redis
docker compose --env-file ../.env up -d api web
docker compose --env-file ../.env --profile compose-nginx rm -sf nginx >/dev/null 2>&1 || true

# Русский комментарий: для первого bootstrap используем db push; после появления миграций заменим на migrate deploy.
docker compose --env-file ../.env exec -T api pnpm --filter @logoff/wms-api prisma:push

if [ -f "$HOST_NGINX_AVAILABLE" ]; then
  cp "$HOST_NGINX_AVAILABLE" "$HOST_NGINX_AVAILABLE.bak.$(date +%Y%m%d-%H%M%S)"
fi

cp "$APP_DIR/wms/infra/nginx/host-wms.logoff.pro.conf" "$HOST_NGINX_AVAILABLE"
ln -sfn "$HOST_NGINX_AVAILABLE" "$HOST_NGINX_ENABLED"
nginx -t
systemctl reload nginx

curl -fsS http://127.0.0.1:3000/api/v1/health >/dev/null
curl -fsS http://127.0.0.1:3080 >/dev/null
docker compose --env-file ../.env ps
