#!/bin/sh
# Installs one coding-agent CLI into the runtime image, at the version the
# recipe was tested against. One image per harness: a session uses one CLI and
# one credential, so an image carrying four buys nothing (docs/plans/harnesses.md).
set -eu
case "${1:-}" in
  claude-code)
    npm install -g --no-fund --no-audit @anthropic-ai/claude-code@2.1.263
    ;;
  *)
    echo "install-harness: unknown harness '${1:-}'" >&2
    exit 1
    ;;
esac
