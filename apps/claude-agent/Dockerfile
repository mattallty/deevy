# The reference agent runtime. Build with the repository root as context:
#   docker build -f apps/claude-agent/Dockerfile -t deevy-agent .
#
# It is not deevy. It holds one Agent's API key, reaches a deevy instance over
# HTTP, and runs Claude against the Issues that Agent is assigned (ADR-0003).
FROM ghcr.io/voidzero-dev/vite-plus:0.3.0 AS build
WORKDIR /src
COPY --chown=vp:vp . .
RUN vp install --frozen-lockfile
RUN vp run claude-agent#build

# The bundle is one file plus the instructions it appends to its system prompt.
# The Agent SDK stays external because it resolves a platform-specific CLI
# binary at runtime, so it is installed here at the version the catalog pins.
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/apps/claude-agent/dist ./dist
RUN npm install --omit=dev --no-package-lock @anthropic-ai/claude-agent-sdk@0.3.261

# The session gets a shell from slice 5, and it is not going to get root with
# it. The container is the boundary (docs/plans/m4.md).
RUN useradd --create-home --uid 10001 runtime
USER runtime
CMD ["node", "dist/main.mjs"]
