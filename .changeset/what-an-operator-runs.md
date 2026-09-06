---
"@deevy/agent": patch
---

The runtime image documents the capabilities it actually needs:
`--cap-drop=ALL --cap-add=SETUID --cap-add=SETGID --cap-add=CHOWN --cap-add=DAC_OVERRIDE`. Two of them are
what lets a session be another user; the other two are what lets the supervisor hand it a working directory
and read back what it wrote. Running with only the first two fails at the first Run.
