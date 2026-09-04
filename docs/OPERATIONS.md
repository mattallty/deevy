# Running deevy

deevy is one container and one volume. A self-hosted instance serves one Workspace (CONTEXT.md), so there is
no tenancy to configure: the first sign-in with `DEEVY_ADMIN_EMAIL` creates the Workspace and becomes its
admin, and everyone else joins through the allowlist.

## The image

Published to `ghcr.io/mattallty/deevy` on every `v0.1.x` tag, for `linux/amd64` and `linux/arm64`. Tags are
the version (`v0.1.3`) and `latest`. The image carries the bundled Node server, the migrations, and the built
SPA; it runs the SPA and the API on one port, so there is no separate web container.

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
by a Human signed in to deevy, in a browser (ADR-0004).

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

## The volume

Everything is in one SQLite file under `/data`. Migrations are applied at startup, so a new image on an old
volume upgrades itself. Mount a named volume or a host directory; do not mount the file itself, because SQLite
writes `-wal` and `-shm` alongside it.

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
