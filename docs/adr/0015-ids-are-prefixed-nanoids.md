# Ids say what they are: a prefix, an underscore, twelve characters

deevy's ids travel in places people and Agents read: MCP tool arguments, Event payloads, the Event log,
webhook bodies, URLs. A UUID says nothing about what it names; `iss_k3xr8v2m9qpw` says it is an Issue,
and an Agent that passes a Run id where an Issue id belongs gets an error that can say so. We chose
Stripe's shape — `<prefix>_<body>` — with a body of twelve characters from `0-9a-z` (about 62 bits, drawn
from the Web Crypto API without modulo bias) rather than nanoid's default alphabet, whose `-` and `_`
break double-click selection and collide with the separator, and rather than ten characters, which are
plenty per Workspace but thin for ids that leave it.

Decided 2026-09-06, after the round-2 UI work; `packages/core/src/ids.ts` is the one place ids are made.

## The map

`ws` Workspace · `mem` Member · `team` Team · `proj` Project · `st` Workflow State · `dec` Gate decision ·
`iss` Issue · `cmt` Comment · `doc` Document · `docv` Document version · `lnk` Link · `lbl` Label · `run`
Run · `act` Run activity · `ntf` Notification · `whk` webhook subscription · `dlv` delivery · `chan` Channel
· `rte` routing rule · `repo` Repository · `alw` allowlist rule. Better Auth's models, through its
`generateId` hook: `usr`, `ses`, `acct`, `ver`, `key` (the API key row; the secret stays `deevy_sk_…`),
`jwk`, `oacl`, `oars`, `oaca`. A model the map does not know keeps its model name as prefix, so no id is
ever bare. Prefixes are at most four characters and are permanent: they are visible to Agents.

## Consequences

- Ids are opaque `text` columns everywhere, so no schema changed and rows created before this keep their
  UUIDs; the development database is reseeded. Nothing may compare id formats; `isId(value, kind)` exists
  for validation at the edges, not for branching.
- `Event.seq` stays an integer — it is the ordering and the cursor. Issue keys (`DEV-42`) stay the public
  handle for Issues. API key secrets stay 64 characters.
- These ids are not time-sortable, like the UUID v4s before them. Every row has `createdAt` and Events
  have `seq`; if a sortable id is ever needed, that is a new decision (ULID, UUID v7), not a tweak here.
- A new entity adds a line to the map in `ids.ts` and nowhere else; `newId(kind)` refuses an unknown kind
  at compile time.
