#!/bin/sh
# Installs one coding-agent CLI into the runtime image, at the version the
# recipe was tested against. One image per harness: a session uses one CLI and
# one credential, so an image carrying four buys nothing (docs/plans/harnesses.md).
set -eu
case "${1:-}" in
  claude-code)
    npm install -g --no-fund --no-audit @anthropic-ai/claude-code@2.1.263
    ;;
  opencode)
    npm install -g --no-fund --no-audit opencode-ai@1.18.29
    ;;
  cursor)
    # cursor.com/install writes into the caller's home; this is what it does,
    # at the version its recipe was tested against, into a system path.
    case "$(uname -m)" in x86_64|amd64) arch=x64 ;; arm64|aarch64) arch=arm64 ;; *) echo "install-harness: unsupported arch" >&2; exit 1 ;; esac
    version=2026.09.02-c22c1a3
    mkdir -p /opt/cursor-agent
    curl -fsSL "https://downloads.cursor.com/lab/$version/linux/$arch/agent-cli-package.tar.gz" \
      | tar --strip-components=1 -xzf - -C /opt/cursor-agent
    ln -s /opt/cursor-agent/cursor-agent /usr/local/bin/agent
    ln -s /opt/cursor-agent/cursor-agent /usr/local/bin/cursor-agent
    ;;
  copilot)
    npm install -g --no-fund --no-audit @github/copilot@1.0.83
    ;;
  *)
    echo "install-harness: unknown harness '${1:-}'" >&2
    exit 1
    ;;
esac
