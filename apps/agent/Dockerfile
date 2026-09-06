# The reference agent runtime. Build with the repository root as context:
#   docker build -f apps/agent/Dockerfile -t deevy-agent .
#
# It is not deevy. It holds one Agent's API key, reaches a deevy instance over
# HTTP, and runs a coding-agent CLI against the Issues that Agent is assigned
# (ADR-0003). `--build-arg HARNESS=<name>` picks the CLI; see harness.sh.
FROM ghcr.io/voidzero-dev/vite-plus:0.3.0 AS build
WORKDIR /src
COPY --chown=vp:vp . .
RUN vp install --frozen-lockfile
RUN vp run agent#build

# The bundle is one file plus the instructions it appends to its system prompt.
# The harness is a CLI the runtime spawns (docs/plans/harnesses.md), installed
# here at a pinned version; `HARNESS` picks which, and the image is tagged by it.
ARG HARNESS=claude-code
FROM node:24-slim AS runtime
ARG HARNESS
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/apps/agent/dist ./dist
COPY apps/agent/harness.sh /usr/local/bin/install-harness
RUN install-harness "$HARNESS"
ENV DEEVY_AGENT_HARNESS=$HARNESS

# The session gets a shell from slice 5, and it is not going to get root with
# it. The container is the boundary (docs/plans/m4.md).
RUN useradd --create-home --uid 10001 runtime
USER runtime
# /healthz always, and deevy's deliveries when a webhook secret is configured.
EXPOSE 8787
CMD ["node", "dist/main.mjs"]
