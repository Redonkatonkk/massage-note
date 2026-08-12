FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 UV_USE_IO_URING=0 CI=true
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN timeout -k 5s 210s pnpm install --frozen-lockfile --network-concurrency=1 --child-concurrency=1 \
    || (test -f apps/api/node_modules/@nestjs/cli/bin/nest.js \
        && test -f apps/web/node_modules/next/dist/bin/next \
        && test -f packages/database/node_modules/prisma/build/index.js \
        && echo "pnpm 已完成安装；忽略跨架构模拟器的退出挂起")
COPY . .
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
ARG NEXT_PUBLIC_FIREBASE_API_KEY=
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=
ARG NEXT_PUBLIC_FIREBASE_APP_ID=
ARG API_PROXY_TARGET=
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    API_PROXY_TARGET=$API_PROXY_TARGET \
    NEXT_PUBLIC_DEV_AUTH_ENABLED=false
RUN timeout -k 5s 360s pnpm build \
    || (test -f apps/api/dist/main.js \
        && test -f apps/web/.next/standalone/apps/web/server.js \
        && test -f packages/database/src/generated/client/index.js \
        && echo "构建产物完整；忽略跨架构模拟器的退出挂起")
RUN timeout -k 5s 180s pnpm --filter @massage-note/api deploy --prod --legacy /out/api \
    || test -f /out/api/dist/main.js
RUN timeout -k 5s 180s pnpm --filter @massage-note/database deploy --prod --legacy /out/database \
    || test -f /out/database/prisma/schema.prisma

FROM node:24-alpine AS api
WORKDIR /app
ENV NODE_ENV=production API_PORT=4000
ARG APP_VERSION=0.6.8
LABEL org.opencontainers.image.title="Massage note API" \
      org.opencontainers.image.version=$APP_VERSION
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=build --chown=appuser:appgroup /out/api ./
USER appuser
EXPOSE 4000
CMD ["node", "dist/main.js"]

FROM node:24-alpine AS migrate
WORKDIR /app
ENV NODE_ENV=production
ARG APP_VERSION=0.6.8
LABEL org.opencontainers.image.title="Massage note migration" \
      org.opencontainers.image.version=$APP_VERSION
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=build --chown=appuser:appgroup /out/database ./
USER appuser
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

FROM node:24-alpine AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
ARG APP_VERSION=0.6.8
LABEL org.opencontainers.image.title="Massage note Web" \
      org.opencontainers.image.version=$APP_VERSION
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=build --chown=appuser:appgroup /app/apps/web/.next/standalone ./
USER appuser
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM node:24-alpine AS nas
WORKDIR /opt/massage-note
ENV NODE_ENV=production \
    API_PORT=4000 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
ARG APP_VERSION=0.6.8
LABEL org.opencontainers.image.title="Massage note" \
      org.opencontainers.image.description="Massage note Web/API image for Synology Container Manager" \
      org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.vendor="Massage note" \
      org.opencontainers.image.source="https://github.com/Redonkatonkk/massage-note"
RUN apk add --no-cache postgresql-client tini \
    && addgroup -S appgroup \
    && adduser -S appuser -G appgroup
COPY --from=build --chown=appuser:appgroup /out/api ./api
COPY --from=build --chown=appuser:appgroup /out/database ./database
COPY --from=build --chown=appuser:appgroup /app/apps/web/.next/standalone ./web
COPY --chown=appuser:appgroup docker/nas/nas-entrypoint.sh ./nas-entrypoint.sh
COPY --chown=appuser:appgroup docker/nas/harden-database.sh ./harden-database.sh
RUN chmod 0555 ./nas-entrypoint.sh ./harden-database.sh
USER appuser
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--", "/opt/massage-note/nas-entrypoint.sh"]
CMD ["app"]
