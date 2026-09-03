# Build with the repository root as context:
#   docker build -f apps/server/Dockerfile -t deevy .
FROM ghcr.io/voidzero-dev/vite-plus:0.3.0 AS build
# The image runs as the unprivileged `vp` user; give it the sources.
WORKDIR /src
COPY --chown=vp:vp . .
RUN vp install --frozen-lockfile
RUN vp run -r build

# The server bundle is self-contained (no native modules, ADR-0008), so the
# runtime image carries only dist/, the migrations, and the built SPA.
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /src/apps/server/dist ./dist
COPY --from=build /src/apps/web/dist ./web
ENV DEEVY_PORT=3000 \
    DEEVY_DATABASE_PATH=/data/deevy.sqlite \
    DEEVY_WEB_DIST=/app/web
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "dist/index.mjs"]
