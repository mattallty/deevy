# Running deevy

deevy is one container and one volume. A self-hosted instance serves one Workspace (CONTEXT.md), so there is
no tenancy to configure: the first sign-in with `DEEVY_ADMIN_EMAIL` creates the Workspace and becomes its
admin, and everyone else joins through the allowlist.

## The image

Published to `ghcr.io/mattallty/deevy` on every `v0.1.x` and `v0.2.x` tag, for `linux/amd64` and
`linux/arm64`. Tags are the version (`v0.2.0`) and `latest`. The image carries the bundled Node server, the
migrations, and the built SPA; it runs the SPA and the API on one port, so there is no separate web container.

```bash
docker run -d --name deevy -p 3000:3000 -v deevy-data:/data \
  -e BETTER_AUTH_URL=https://deevy.example.com \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  -e GITHUB_CLIENT_ID=... -e GITHUB_CLIENT_SECRET=... \
  -e DEEVY_ADMIN_EMAIL=you@example.com \
  ghcr.io/mattallty/deevy:latest
```

## Environment

| Variable                       | Required | What it does                                                                |
| ------------------------------ | -------- | --------------------------------------------------------------------------- |
| `BETTER_AUTH_URL`              | yes      | The public URL. Sign-in callbacks derive from it, so it must match reality. |
| `BETTER_AUTH_SECRET`           | yes      | At least 32 random characters. Changing it signs everyone out.              |
| `GITHUB_CLIENT_ID`             | yes      | GitHub OAuth App. Callback `${BETTER_AUTH_URL}/api/auth/callback/github`.   |
| `GITHUB_CLIENT_SECRET`         | yes      | As above.                                                                   |
| `DEEVY_ADMIN_EMAIL`            | yes      | The first sign-in with this address creates the Workspace and is its admin. |
| `DEEVY_WORKSPACE_NAME`         | no       | The Workspace's initial name. Renameable later under Settings, Workspace.   |
| `DEEVY_DATABASE_PATH`          | no       | Defaults to `/data/deevy.sqlite`, inside the volume.                        |
| `DEEVY_PORT`                   | no       | Defaults to 3000.                                                           |
| `DEEVY_WEB_ORIGIN`             | no       | Extra browser origin allowed to call the API with cookies. Only for split   |
|                                |          | deployments; the single container serves the SPA from its own origin.       |
| `DEEVY_WEB_DIST`               | no       | Directory of the built SPA to serve. The image sets it to `/app/web`;       |
|                                |          | unset, the server answers the API and serves no pages.                      |
| `DEEVY_RUN_STALE_MINUTES`      | no       | Silence after which a Run goes `stale`. Defaults to 30. `stale` is          |
|                                |          | recoverable: the Agent's next Activity puts the Run back to `active`.       |
| `DEEVY_SWEEP_INTERVAL_SECONDS` | no       | How often the background runner looks for silent Runs. Defaults to 60.      |

The GitHub OAuth App needs the `read:org` scope for `github_org` allowlist rules. deevy requests it, so an App
created before that will ask for the extra scope at the next sign-in.

## Agents and MCP

deevy never runs an agent (ADR-0003). It gives each Agent an identity and a key, tells it there is work, and
takes a Run back; something outside deevy does the running.

A Sponsor creates an Agent under Settings, Agents. Creating one makes a Member with `kind = agent` whose
Sponsor is the Human who created it, and issuing a key shows the key **once**. Grant the Agent the Projects it
should see: an ungranted Project does not exist to it, and an Agent starts with none.

The MCP endpoint is `POST ${BETTER_AUTH_URL}/mcp`, and the Agent authenticates with its key as a bearer token:

```bash
claude mcp add --transport http deevy "$DEEVY_URL/mcp" --header "Authorization: Bearer $DEEVY_AGENT_KEY"
```

It is stateless, so any instance answers any request and nothing has to stick to one process. An
unauthenticated request answers 401 naming its Protected Resource Metadata, which is how a client knows to
start an OAuth flow rather than simply failing.

An Agent can do less than a Human by construction: it can read and write Issues, Documents, comments, Labels
and Links in the Projects it was granted, and drive its own Runs. It can never administer the Workspace,
manage Members, or approve a Gate, and neither can anything holding a delegated credential — a Gate is decided
by a Human signed in to deevy, in a browser (ADR-0004, ADR-0010). Which operations an Agent may call at all is
default-deny, per operation (ADR-0011).

[agent-loop.md](./agent-loop.md) is a worked example of the runtime on the other side: the MCP configuration a
Claude Code loop needs, the instructions that tell it how to work an Issue, and what the Human does at the
Gate.

## A Human's own MCP client

A Human points their own client at the same endpoint with no header at all, and acts as themselves rather
than as an Agent:

```bash
claude mcp add --transport http deevy "$DEEVY_URL/mcp"
```

deevy is its own OAuth 2.1 authorization server (ADR-0007). The client discovers it from the 401 challenge,
sends the Human to deevy in a browser to sign in and consent, and is issued an access token bound to
`${BETTER_AUTH_URL}/mcp`. The Human sees every client that consented under Settings, MCP clients, and can
revoke one there. Revoking removes the consent and the refresh token; an access token already issued expires
on its own within the hour.

Two documents make this discoverable, and both are served from the instance origin rather than from under
`/api/auth`, because RFC 8414 and RFC 9728 both build a metadata URL by inserting the well-known segment
right after the host:

- `${BETTER_AUTH_URL}/.well-known/oauth-protected-resource/mcp` — and the root form beside it.
- `${BETTER_AUTH_URL}/.well-known/oauth-authorization-server`, and `/.well-known/openid-configuration`.

`BETTER_AUTH_URL` is what all of it is built from, so **the OAuth server is off when it is unset**. It has to
be, since a resource identifier is an absolute URL and one guessed per request would bind tokens to whatever
host the caller sent. The rest of deevy runs unchanged; only a Human's MCP client is refused.

### Client registration, and what is known to be weak

A client identifies itself in one of two ways, both enabled:

- **Client ID Metadata Documents** (CIMD), which MCP 2026-07-28 prefers: the `client_id` is an HTTPS URL, and
  deevy fetches the document at it. `client_id_metadata_document_supported: true` is advertised.
- **Dynamic client registration** at `/api/auth/oauth2/register`, unauthenticated. It is deprecated in the
  2026-07-28 revision and stays on only because the clients that do not speak CIMD cannot be asked to change.
  Anyone who can reach the instance can create a client row; a client is worth nothing until a Human consents
  to it, so the cost of that is rows, not access.

**Known limitation.** Dereferencing a Client ID Metadata Document means fetching a URL an unknown caller
chose, so the transport is the SSRF boundary. `@better-auth/cimd/node` ships a strict one built on `node:dns`
and `node:https`, and deevy does not use it: `packages/core` is web-standard only (ADR-0006), and M3's
Cloudflare Worker has no DNS-resolution primitive to build it on. deevy's own transport
(`packages/core/src/cimd.ts`) refuses every non-HTTPS scheme, every host that is not publicly routable, and
every redirect, and bounds the request in time and size — but it cannot pin the resolved address between the
check and the connection, so a name that resolves public and then private is not caught. The reachable outcome
is a blind GET from the instance: nothing of the response is returned to the caller. Put the instance behind
an egress policy if that matters, or pass a stricter transport as `AuthEnv.fetchClientMetadataResource`.

Scopes ride on the token and are enforced by nothing in v1: a Human's MCP client can do whatever that Human
can, less the one thing below.

**Except a Gate.** `gates.approve` and `gates.reject` require a browser session. A Human's own MCP client
holding a valid token for that same Human is refused, deliberately: an approval is a Human's act in deevy's
UI, and a delegated credential is not that Human (ADR-0004, docs/plans/m2.md).

## Webhooks

deevy tells a URL that something happened, and that is the whole of how an Agent is triggered when it does not
poll (ADR-0003). Every Event is matched against the Workspace's subscriptions as it is appended, and each
match becomes a durable delivery row; the background runner sends them. Nothing is lost if the process
restarts mid-flight, because the row is the record and the Event log is what it renders from.

A subscription is a URL, a secret, an optional list of Event kinds, and an optional Project. Admins manage
them under Settings, Webhooks; a Sponsor sees and manages the subscriptions belonging to the Agents they
sponsor. The URL must be `https`. The kind filter takes exact kinds (`issue.assigned`) or a family
(`run.*`, every kind an Event about a Run carries); no filter means every kind, and no Project means every
Project.

The secret goes in and never comes out — not from the API, not from the Event log, not from `openapi.json` —
so choose it yourself when you create the subscription and keep it where the receiver can read it. The same
holds on the Agent's own page: setting an Agent's webhook URL for the first time asks for a secret too, and
deevy will not invent one, because a secret nobody can read signs nothing. Setting a new one overwrites the
old and appends `webhook.subscribed` with `secretChanged: true`. The URL must be `https`, on either page: a
signature is worth nothing when the body it signs is on the wire in the clear.

Each POST carries three headers:

| Header            | What it is                                                                           |
| ----------------- | ------------------------------------------------------------------------------------ |
| `deevy-signature` | `t=<unix seconds>,v1=<hex>`, described below.                                        |
| `deevy-delivery`  | The delivery's id. Every retry of the same Event carries the same one: dedupe on it. |
| `deevy-event`     | The Event's sequence number, which is also `seq` in the body.                        |

The body is the Event row and nothing else: `seq`, `kind`, `workspaceId`, `projectId`, `subjectType`,
`subjectId`, `actorMemberId`, `payload`, `createdAt`.

A delivery that is refused is attempted eight times in all, waiting ten seconds after the first failure and
doubling from there with a little jitter, capped at six hours. After the eighth, deevy gives up and appends a
`webhook.exhausted` Event.
Settings, Webhooks lists the recent attempts for a subscription with the status and the error each came back
with, and can owe one again from the beginning.

### Verifying `deevy-signature`

The header is `t=<unix seconds>,v1=<hex>`. `v1` is HMAC-SHA256, hex-encoded, over the string
`<the same unix seconds>.<the raw body>`, keyed with the subscription's secret. The timestamp is inside the
signed message rather than beside it, so it cannot be moved forward to keep an old body alive, and a signature
more than five minutes from the receiver's clock is a replay whatever it verifies against.

Verify against the **bytes you received**. Parsing the JSON and serialising it again changes the body and the
signature will not match.

```js
import { createHmac, timingSafeEqual } from "node:crypto";

const toleranceSeconds = 5 * 60;

function verify(secret, header, rawBody, now = new Date()) {
  const parts = Object.fromEntries(
    header
      .split(",")
      .map((part) => part.trim().split("="))
      .filter((pair) => pair.length === 2),
  );
  const seconds = Number(parts.t);
  if (!Number.isFinite(seconds)) return false;
  if (Math.abs(Math.floor(now.getTime() / 1000) - seconds) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${seconds}.${rawBody}`).digest("hex");
  const given = Buffer.from(parts.v1 ?? "", "utf8");
  const mine = Buffer.from(expected, "utf8");
  return given.length === mine.length && timingSafeEqual(given, mine);
}
```

deevy's own implementation is `packages/core/src/webhooks.ts`, which exports `verifySignature` beside the
signer for exactly this reason. It uses `crypto.subtle` rather than `node:crypto` (ADR-0006); the maths is the
same either way.

## Notification Channels and routing

A Notification reaches a Human through Channels: their in-app inbox always, and a Slack channel when the
Workspace routes it there. Five kinds exist — `mention`, `assignment`, `gate_awaiting`, `run_awaiting_input`,
`run_finished` — and who a Notification concerns is decided from the Event alone, never from where it is
delivered. Turning Slack off changes where a Human hears about something, never whether it concerns them.

An admin adds a Channel under Settings, Channels: a name, usually the Slack channel (`#deevy`), and a Slack
[incoming webhook](https://api.slack.com/messaging/webhooks) URL. There is a Test button that posts to it now,
so a wrong URL is found in the room rather than three days later. The URL is a credential: it is stored in the
Channel's config, and the Event log records only its host.

Routing rules, also under Settings, Channels, say which kinds go to which Channel. A rule with no kind means
every kind and a rule with no Project means every Project, so "everything to `#deevy`" is one rule and
"`gate_awaiting` on the Platform Project to `#platform`" is another. Each Human then narrows their own share
under Settings, Notifications: a matrix of kind against inbox and Slack, where a Member who has never said
otherwise gets everything in both.

A Slack message is a durable delivery row like a webhook, retried on the same schedule machinery and given up
on after six attempts. One message per Channel per Event, not per recipient: a Channel is a room, and three
Humans concerned by one Event are not three messages in it.

Slack messages link back to the Issue, so they are only sent when the instance knows its own URL. **Without
`BETTER_AUTH_URL` the rows are written and wait** rather than going out with a dead link; the first tick after
the instance is given an origin sends them.

## The volume

Everything is in one SQLite file under `/data`. Migrations are applied at startup, so a new image on an old
volume upgrades itself. Mount a named volume or a host directory; do not mount the file itself, because SQLite
writes `-wal` and `-shm` alongside it.

## The schema, on either runtime

One schema, two appliers, two journals (ADR-0008). Nothing is shared between them, because nothing needs to
be: a D1 database is only ever migrated by wrangler, and a SQLite file only ever by the Node migrator.

| What                | Node                                 | Workers                                       |
| ------------------- | ------------------------------------ | --------------------------------------------- |
| Where the rows live | `DEEVY_DATABASE_PATH`, a SQLite file | the `DB` binding, a D1 database               |
| What is applied     | `packages/db/drizzle/<folder>/`      | `packages/db/migrations/NNNN_<folder>.sql`    |
| Who applies it      | the migrator, at startup             | `wrangler d1 migrations apply deevy`, by hand |
| Record of what ran  | `__drizzle_migrations`               | wrangler's own `d1_migrations`                |
| If it never runs    | the server exits at startup          | every request fails on a missing table        |

`packages/db/migrations` is a build artifact, not a source: `vp run db#generate:d1` writes it from
`packages/db/drizzle`, `vp run db#generate` chains the two, and `vp run db#check:migrations` fails CI on a
stale one exactly as a stale `openapi.json` does. `apps/web/wrangler.jsonc` points the `DB` binding at it
through `migrations_dir`, and `vp run db#check:d1` applies it to an empty local D1 and checks that what
wrangler built is the schema `packages/db/src/schema` describes. None of that needs a Cloudflare account.

The projection is not a copy. drizzle separates statements with `--> statement-breakpoint`; the emitter turns
those into plain statement separation and refuses, naming the file and the line, anything D1 will not honour:
transaction control, `ATTACH`, `DETACH`, `VACUUM`, and every `PRAGMA`. The PRAGMA is the one that matters.
D1 runs a batch inside a transaction, where SQLite ignores `PRAGMA foreign_keys` outright — so the
`PRAGMA foreign_keys=OFF` that drizzle wraps around a table rebuild, and that the Node migrator honours at
the connection, does nothing on D1, the rebuild's `DROP TABLE` cascades the children away, and wrangler
reports success. Better to fail while generating.

The `database_id` in `apps/web/wrangler.jsonc` is a placeholder. Local D1 never reads it; a deployment needs
the real one from `wrangler d1 create deevy`.

## Upgrading

```bash
docker pull ghcr.io/mattallty/deevy:v0.1.4
docker stop deevy && docker rm deevy
docker run -d --name deevy ... ghcr.io/mattallty/deevy:v0.1.4   # same -v deevy-data:/data
```

Take a backup first (below). Migrations only ever move forward: there is no down migration, so restoring a
backup is how you go back.

## Backup and restore

`sqlite3 .backup` takes a consistent copy of a live database, which copying the file does not. The runtime
image is `node:24-slim` and has no `sqlite3` binary, so run it from a small sidecar against the same volume:

```bash
docker run --rm -v deevy-data:/data -v "$PWD:/out" alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null && sqlite3 /data/deevy.sqlite ".backup /out/deevy-$(date +%F).sqlite"'
```

Restoring is the reverse, with the container stopped so nothing is mid-write:

```bash
docker stop deevy
docker run --rm -v deevy-data:/data -v "$PWD:/in" alpine \
  sh -c 'rm -f /data/deevy.sqlite-wal /data/deevy.sqlite-shm && cp /in/deevy-2026-09-03.sqlite /data/deevy.sqlite'
docker start deevy
```

Deleting the `-wal` and `-shm` files matters: leaving a stale write-ahead log next to a restored database
gives SQLite two disagreeing versions of the truth.

## Health

`/healthz` answers `{"ok":true}` as soon as the server is listening and the migrations have run, which makes
it a usable container healthcheck and readiness probe. `/api/docs` serves the API reference.
