# Puts `vp` on PATH for a git hook, which does not inherit an interactive shell's.
#
# Vite+ installs outside the repository and ships an env file meant for a shell
# profile. That file is never sourced here: it is written for an interactive
# shell and a hook that waits on one hangs the commit with no output
# (docs/DEVELOPMENT.md).
if ! command -v vp >/dev/null 2>&1; then
  PATH="$HOME/.local/share/vite-plus/bin:$PATH"
  export PATH
fi

if ! command -v vp >/dev/null 2>&1; then
  echo "husky: cannot find vp." >&2
  echo "  Install Vite+, or put its bin directory on PATH, then try again." >&2
  echo "  To commit without this check once: git commit --no-verify" >&2
  exit 1
fi
