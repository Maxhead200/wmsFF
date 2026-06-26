FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG APP_NAME
COPY . .
RUN pnpm --filter @logoff/wms-${APP_NAME} build

FROM node:22-alpine AS runtime
ARG APP_NAME
WORKDIR /app
ENV NODE_ENV=production
ENV APP_NAME=${APP_NAME}
RUN corepack enable
COPY --from=build /app /app
CMD ["sh", "-lc", "if [ \"$APP_NAME\" = \"api\" ]; then pnpm --filter @logoff/wms-api start; else pnpm --filter @logoff/wms-web vite --host 0.0.0.0 --port 5173; fi"]
