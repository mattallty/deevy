---
"@deevy/agent": patch
---

The reference runtime no longer hands its session the Agent's API key. The session reaches deevy through a
loopback proxy the runtime opens for each Run, which adds the key, offers only the twelve tools the runtime
grants, and refuses any other tool before deevy hears of it; a refusal is written into the Run's feed as an
error Activity. The runtime also checks that deevy answers the key before a session starts, and fails the Run
with the reason when it does not.
