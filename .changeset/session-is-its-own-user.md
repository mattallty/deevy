---
"@deevy/agent": patch
---

A session now runs as its own user, so it can no longer read the supervisor's environment. On one user a
session with a shell reads the Agent's API key and the git token out of `/proc`, whatever the environment
allowlist hands it; the image gives the supervisor root and each session uid 10002, and the working directory
and the session's home are handed over before it starts. Run the container with
`--cap-drop=ALL --cap-add=SETUID --cap-add=SETGID`. A runtime that is not root keeps its old shape and says
so in its first lines, which is fine for trying it out and is not a way to run it against a Workspace other
people write in.
