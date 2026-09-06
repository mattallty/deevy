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

# Two users, because one is not a boundary. The supervisor runs as root so it
# can spawn each session as `session`, which is what puts the supervisor's
# environment — the Agent's key, the git token — outside what a shell in that
# session can read; on one user it reads them out of `/proc`
# (docs/plans/agent-owns-git.md, ADR-0019). Root here is root in a container
# with no capability but the one this needs:
#
#   docker run --cap-drop=ALL --cap-add=SETUID --cap-add=SETGID \
#              --cap-add=CHOWN --cap-add=DAC_OVERRIDE ...
#
# Four, and each was measured rather than guessed: SETUID and SETGID to become
# the session, CHOWN to hand it its working directory, and DAC_OVERRIDE to read
# and clean up what it wrote afterwards. With only the first two the runtime
# fails at the first Run.
#
# Run the image with `--user` instead and the runtime keeps its old shape, says
# so in its first line, and is fine for trying out and not for a Workspace
# other people write in.
RUN useradd --create-home --uid 10001 runtime \
    && useradd --no-create-home --uid 10002 session
# /healthz always, and deevy's deliveries when a webhook secret is configured.
EXPOSE 8787
CMD ["node", "dist/main.mjs"]
