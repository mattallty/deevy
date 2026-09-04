# Running deevy

deevy is one container and one volume. A self-hosted instance serves one Workspace (CONTEXT.md), so there is
no tenancy to configure: the first sign-in with `DEEVY_ADMIN_EMAIL` creates the Workspace and becomes its
admin, and everyone else joins through the allowlist.

## The image

Published to `ghcr.io/mattallty/deevy` on every `v0.1.x`, `v0.2.x` and `v0.3.x` tag, for `linux/amd64` and
`linux/arm64`. Tags are the version (`v0.3.0`) and `latest`. The image carries the bundled Node server, the
migrations, and the built SPA; it runs the SPA and the API on one port, so there is no separate web container.

```bash
docker run -d --name deevy -p 3000:3000 -v deevy-data:/data \
  -e BETTER_AUTH_URL=https://deevy.example.com \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  -e GITHUB_CLIENT_ID=... -e GITHUB_CLIENT_SECRET=... \
  -e DEEVY_ADMIN_EMAIL=you@example.com \
  ghcr.io/mattallty/deevy:latest
```

## The Worker

The second deployment shape: the same codebase on Cloudflare, with D1 instead of the volume and a Cron
Trigger instead of the timer (ADR-0006, ADR-0012). Everything below fits a free account except where it says
otherwise, and none of it needs CI — there is no deploy-on-tag workflow for the Worker, because publishing one
needs an account and the project keeps the deploy in a person's hands.

**The deploy artifact is the build's output.** `vp run web#build:workers` emits two directories:
`apps/web/dist/deevy` — the bundled Worker and `wrangler.json`, the committed `wrangler.jsonc` with the built
entry and the built asset directory filled in — and `apps/web/dist/client`, the SPA those assets are. The
committed `wrangler.jsonc` is a source, not a deploy artifact: it names `src/worker.ts` and an `assets` block
with no `directory`, so wrangler refuses it on its own. The Cloudflare plugin writes
`apps/web/.wrangler/deploy/config.json` pointing at the built file, which is how a bare `wrangler deploy` finds
it, and `vp run web#check:workers` names that same file rather than trusting the note — a dry run of anything
else is a typecheck of a configuration nobody ships.

So: **build, then check, then deploy, in that order**, and a deploy that follows no build uploads the last
build's bundle.

### Deploying to a free account

Run steps 3 onward from `apps/web`, so wrangler finds its own configuration.

1. **Build and validate.** From the repository root:

   ```bash
   vp install
   vp run web#build:workers
   vp run web#check:workers
   ```

   The check ends with `--dry-run: exiting now.` and the bindings it found — `env.DB (deevy)`, a D1 Database.
   A failure here is a configuration that would have failed on upload.

2. **Sign in to Cloudflare.** `wrangler login` opens a browser and ends with `Successfully logged in.`
   `wrangler whoami` names the account everything below lands in.

3. **Deploy once**, which provisions the database and tells you the origin. `wrangler deploy` finds a
   `d1_databases` entry with a name and no id, says so, and creates it before it uploads anything:

   ```
   The following bindings need to be provisioned:
   Binding        Resource
   env.DB         D1 Database

   Provisioning DB (D1 Database)...
   Resource name found in config: deevy
   🌀 Creating new D1 Database "deevy"...
   ✨ DB provisioned 🎉
   ```

   There is no `wrangler d1 create` step and no `database_id` to paste anywhere: wrangler remembers which
   database it made, so the next deploy finds the same one, and nothing account-specific is ever committed. It
   then prints the `workers.dev` URL — `https://deevy.<subdomain>.workers.dev` — and the Cron Trigger it
   registered. Sign-in does not work yet and nothing else has to:
   `curl https://deevy.<subdomain>.workers.dev/healthz` answers `{"ok":true}`, and the SPA loads and says
   nobody is signed in.

4. **Build the schema.** The database exists now but is empty, so this follows the first deploy rather than
   preceding it.

   ```bash
   wrangler d1 migrations apply deevy --remote
   wrangler d1 migrations list deevy --remote
   wrangler d1 execute deevy --remote --command "select name from sqlite_master where type='table' order by name"
   ```

   The first lists the twenty-two files in `packages/db/migrations`, asks to confirm, and reports each as
   applied. The second then says there is nothing left to apply. The third lists deevy's tables plus
   wrangler's own `d1_migrations`. Applying twice is a no-op. Nothing here touches the local D1 that
   `vp run web#test:workers` uses; `--remote` is the whole difference.

5. **Create the GitHub OAuth App** at <https://github.com/settings/developers>, with that origin as the
   homepage and `https://deevy.<subdomain>.workers.dev/api/auth/callback/github` as the Authorization callback
   URL. The table under [Signing in](#signing-in-and-the-origin-better_auth_url-names) is the full set of
   origins and callbacks; the rule is that `BETTER_AUTH_URL` and the callback change together or sign-in
   breaks.

6. **Put the secrets in.** Each command prompts for the value and answers `Success! Uploaded secret <name>`:

   ```bash
   wrangler secret put BETTER_AUTH_URL          # https://deevy.<subdomain>.workers.dev
   wrangler secret put BETTER_AUTH_SECRET       # openssl rand -base64 32
   wrangler secret put GITHUB_CLIENT_ID
   wrangler secret put GITHUB_CLIENT_SECRET
   ```

   `wrangler secret list` shows the four names and no values. The rest are not credentials, so they can go in
   a `vars` block in `apps/web/wrangler.jsonc`, where a reviewer can see them:

   ```jsonc
   "vars": { "DEEVY_ADMIN_EMAIL": "you@example.com", "DEEVY_WORKSPACE_NAME": "Flippable" },
   ```

   Deploying a public fork, put `DEEVY_ADMIN_EMAIL` in with `wrangler secret put` instead. It is not a
   credential, but it is somebody's personal address, and a `vars` block is committed. A secret and a var
   reach the Worker identically — `readWorkerEnv` cannot tell them apart — so this costs nothing but the
   reviewer's view of it.

7. **Deploy again**, if the `vars` block changed: step 1 again from the repository root, because that block is
   part of the source the build projects, then `wrangler deploy` from `apps/web`. The output names the Cron
   Trigger it registered alongside the bindings. A secret needs no deploy — `wrangler secret put` publishes a
   new version by itself, live within a few seconds — so a deployment configured entirely through secrets
   skips this step.

8. **Check the trigger fires**, by giving it something to do rather than by watching the log. `wrangler tail`
   does not reliably surface `scheduled` invocations — ten minutes of it on a working deployment showed
   request traffic and no scheduled event at all, which reads exactly like a dead schedule and is not one. So
   ask the sweep for a visible effect instead: give an Agent that has an assigned Issue a one-minute schedule,
   and a Run with `trigger = "schedule"` appears within two minutes. That is `runDueWork`, one bounded pass
   (ADR-0012), driven by Cloudflare's own timer.

   ```bash
   wrangler d1 execute deevy --remote --command "update agent set schedule_minutes = 1"
   # wait two minutes, then:
   wrangler d1 execute deevy --remote --command "select status, trigger from run"
   # and put it back:
   wrangler d1 execute deevy --remote --command "update agent set schedule_minutes = null"
   ```

9. **Sign in** at the `workers.dev` origin with the GitHub account whose email is `DEEVY_ADMIN_EMAIL`. The
   first sign-in creates the Workspace and makes you its admin, and nothing else ever creates a second one.
   Settings, Members lists exactly one Member — you, `admin`, `human`. The Event log behind that has no
   Workspace-level view in the SPA, where it is read per Issue as the timeline; the whole log is
   `GET /api/events`, which a signed-in browser can simply visit, and it opens with `workspace.created` then
   `member.joined`, both with a null actor because deevy did the writing.

### What a free account does not give you

- **Queues are paid.** The `JOBS` binding is optional in the `Env` type and absent from the committed
  configuration for exactly this reason: `wrangler deploy` must not fail on a queue the account may not
  create. Without it a webhook goes out at the next Cron pass instead of the moment it is owed, and nothing
  else differs — see [Queues, when the account has them](#queues-when-the-account-has-them).
- **A Cron Trigger comes round once a minute at the finest.** That is Cloudflare's floor, not deevy's, and it
  is why `DEEVY_SWEEP_INTERVAL_SECONDS` is a Node-only knob. A backlog drains twenty rows a minute.
- **D1 caps the queries one invocation may run**, which is what bounds a live stream's life and what
  `DEEVY_STREAM_SECONDS` divides up. The design assumes the free tier's 50 queries per invocation and 100k
  rows written per day; Cloudflare's own limits pages are the current numbers, and a busy Workspace outgrows
  the daily one long before it outgrows the per-invocation one.
- **Nothing deploys the Worker from CI.** `vp run web#check:workers` proves the artifact on every pull
  request; uploading it is `wrangler deploy` by a person. The Docker image is the half CI does publish, on a
  version tag.
- **A deployed Worker cannot pin an outbound address**, which is the one place where the Cloudflare deployment
  is weaker than the Docker one. It is a workerd limitation and it is written out in full under
  [Client registration](#client-registration-and-what-is-known-to-be-weak).

## Environment

One name per knob on both runtimes: an environment variable on Node, a `var` or a secret on Workers. On
Workers a secret is `wrangler secret put NAME`, a var is a `vars` entry in `apps/web/wrangler.jsonc`, and
locally both come from `apps/web/.dev.vars` — copy `apps/web/.dev.vars.example`. wrangler reads it from
beside `wrangler.jsonc`, so run `wrangler dev` from `apps/web` and let it find its own configuration;
`.gitignore` keeps the file itself out of the repository. Nothing on the Worker reads `process.env`; the
bindings arrive with the request.

| Variable                       | Node        | Workers            | Default              | Without it                                                                                                                                                                                                 |
| ------------------------------ | ----------- | ------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_URL`              | env         | secret             | the request's origin | Sign-in callbacks are wrong, the OAuth server is off, and Slack deliveries wait.                                                                                                                           |
| `BETTER_AUTH_SECRET`           | env         | secret             | —                    | Better Auth falls back to a development key and says so; a Gate elicitation signed by one instance is then refused by the next. Changing it signs everyone out.                                            |
| `GITHUB_CLIENT_ID`             | env         | secret             | —                    | Nobody can sign in. Callback `${BETTER_AUTH_URL}/api/auth/callback/github`.                                                                                                                                |
| `GITHUB_CLIENT_SECRET`         | env         | secret             | —                    | As above.                                                                                                                                                                                                  |
| `DEEVY_ADMIN_EMAIL`            | env         | var                | —                    | No Workspace is ever created, so nobody is a Member.                                                                                                                                                       |
| `DEEVY_WORKSPACE_NAME`         | env         | var                | `deevy`              | Nothing: renameable later under Settings, Workspace.                                                                                                                                                       |
| `DEEVY_WEB_ORIGIN`             | env         | var                | —                    | Nothing, unless the SPA is deployed on its own origin; then its calls are refused by CORS.                                                                                                                 |
| `DEEVY_RUN_STALE_MINUTES`      | env         | var                | 30                   | Nothing: 30 minutes of silence makes a Run `stale`, which its next Activity undoes.                                                                                                                        |
| `DEEVY_SWEEP_INTERVAL_SECONDS` | env         | — the Cron Trigger | 60                   | Nothing: the sweep looks every minute. Node-only, because on Workers the schedule is `triggers.crons` in `apps/web/wrangler.jsonc`.                                                                        |
| `DEEVY_GATE_REMINDER_HOURS`    | env         | var                | 4                    | Nothing: an undecided Gate asks its approvers again every four hours.                                                                                                                                      |
| `DEEVY_STREAM_SECONDS`         | — unbounded | var                | 60                   | Nothing: a live stream on Workers ends after a minute and the browser resumes from the cursor it signed off with. Workers-only, because a Node process holds a connection for as long as the browser does. |
| `JOBS`                         | — the sweep | optional binding   | — no queue           | Nothing: a webhook delivery goes out at the next Cron pass instead of the moment it is owed. Workers-only, and absent from the committed `apps/web/wrangler.jsonc` because Queues are a paid feature.      |
| `DEEVY_DATABASE_PATH`          | env         | — the `DB` binding | `/data/deevy.sqlite` | Node writes to `./data/deevy.sqlite`. On Workers the rows are D1's and the path means nothing.                                                                                                             |
| `DEEVY_PORT`                   | env         | —                  | 3000                 | Node listens on 3000. Workers has no port: the platform routes to the Worker.                                                                                                                              |
| `DEEVY_WEB_DIST`               | env         | —                  | —                    | Node answers the API and serves no pages. On Workers the SPA is the asset handler's, not the app's.                                                                                                        |

The Worker serves the SPA, the API, the reference at `/api/docs`, the MCP challenge and, since M3 slice 5,
signing in: `BETTER_AUTH_*`, `GITHUB_*`, `DEEVY_ADMIN_EMAIL` and `DEEVY_WORKSPACE_NAME` do on Workers exactly
what they do on Node, bootstrap and allowlist included.

### Background work, on a timer or on a Cron Trigger

The stale sweep, the schedule trigger, the Gate reminder and both delivery loops are one function,
`runDueWork` in `packages/core/src/work.ts`, and each runtime brings its own schedule to it. Node's
`startRunner` brings a timer every `DEEVY_SWEEP_INTERVAL_SECONDS` and drains: it goes again while a pass says
there is more. Cloudflare owns its own schedule, so the Worker has no interval to configure — `triggers.crons`
in `apps/web/wrangler.jsonc` runs it every minute, the finest Cloudflare offers, and the `scheduled` handler
takes one bounded pass of twenty rows and lets the next trigger find the rest. A backlog therefore drains a
minute at a time on Workers rather than in one tick, which is the trade a CPU budget and a per-invocation D1
query cap buy.

`DEEVY_RUN_STALE_MINUTES` and `DEEVY_GATE_REMINDER_HOURS` mean the same thing on both. `wrangler dev --local`
fires a trigger by hand at `/cdn-cgi/handler/scheduled?cron=*+*+*+*+*`, and the response waits for the pass, so
a 500 there is the sweep's own error. `--test-scheduled`'s `/__scheduled` does not work on a Worker that also
serves assets: the path is not one `createApp` mounts, so it is not in `assets.run_worker_first` and the asset
handler answers it with the SPA's `index.html`.

Which paths the Worker answers rather than the asset handler is `assets.run_worker_first` in
`apps/web/wrangler.jsonc`. It is part of the routing table, not configuration: a path the app mounts that is
missing from it is answered with the SPA's `index.html` — a 200 with the wrong body — so
`packages/core/tests/worker-routes.test.ts` asserts the list against the app's own routes, and
`vp run web#test:workers` drives the built Worker on `wrangler dev --local` to prove it over HTTP.

The GitHub OAuth App needs the `read:org` scope for `github_org` allowlist rules. deevy requests it, so an App
created before that will ask for the extra scope at the next sign-in.

### Queues, when the account has them

A webhook delivery is a durable row before it is a message: `appendEvent` writes what a subscribed URL is owed
in the same handler as the write, and the sweep above finds it whether or not anything else does. A Queue only
changes when. On an account that has one, the write's tail hands the row's id to the `JOBS` binding, a
consumer picks it up in the next second and the POST goes out at once instead of at the next trigger; on an
account without one there is no binding, `createApp` discards the job, and the trigger is the whole delivery
path. Nothing else differs, which is why the binding is optional in the `Env` type and absent from the
committed `apps/web/wrangler.jsonc` — Queues are paid, and `wrangler deploy` must not fail on a queue a free
account is not allowed to create.

Adding one is two blocks and a name:

```jsonc
"queues": {
  "producers": [{ "binding": "JOBS", "queue": "deevy-jobs" }],
  "consumers": [{ "queue": "deevy-jobs", "max_batch_size": 10, "max_retries": 10 }],
}
```

then `wrangler queues create deevy-jobs` before the deploy that first names it. Queues are at-least-once, so
the same message can arrive twice; that costs one POST rather than two, because `deliverWebhook` claims the
row before it sends and will not claim one that has already landed. A consumer failure is retried by the
queue, and it is the row's own attempt count — not the queue's — that decides when deevy gives up and appends
`webhook.exhausted`, exactly as it would in a sweep. `max_retries` below eight therefore ends a delivery's
life early on a receiver that is down; the Cron pass still finds the row afterwards, so nothing is lost, but
setting it at or above eight keeps the two paths saying the same thing.

### Live updates, and why a stream on Workers ends

The board keeps itself in step by reading the Event log as it happens, over one long-lived request per
browser: `events.subscribe` polls the log and sends what it finds, plus a heartbeat carrying its cursor. On
Node that request lives as long as the browser holds it and `DEEVY_STREAM_SECONDS` means nothing there.

On Workers it cannot. Each poll is one D1 query and D1 caps the queries one invocation may run — 50 on the
free plan — so a stream's life is that cap divided by its poll interval, and a stream that overran it would be
cut off mid-message. deevy ends it first instead: the Worker polls every two seconds and, after
`DEEVY_STREAM_SECONDS`, sends one last heartbeat carrying the cursor it reached and returns. The SPA treats a
clean end as an invitation rather than a failure, reconnecting at once from that cursor, so nothing is missed
and nobody sees the seam. Raising the value raises the query count with it — one every two seconds — so a
value much over 90 spends the whole cap on polling and leaves none for signing the request in.

### Signing in, and the origin `BETTER_AUTH_URL` names

`BETTER_AUTH_URL` has to be the origin the browser actually visits, character for character. Better Auth
builds the OAuth callback from it and sets the session cookie for it, and `packages/core/src/auth.ts` pins
the token issuer and the RFC 8707 resource identifier to it as well. A value naming a host nobody visits
therefore mints tokens bound to that host and a cookie the browser never sends back — and it cannot be
guessed from the request instead, because then a caller would choose the audience of the tokens deevy signs.

The GitHub OAuth App's Authorization callback URL follows from it:

| Where deevy runs          | `BETTER_AUTH_URL`                       | Authorization callback URL                                       |
| ------------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| `wrangler dev --local`    | `http://localhost:8787`                 | `http://localhost:8787/api/auth/callback/github`                 |
| a `workers.dev` subdomain | `https://deevy.<subdomain>.workers.dev` | `https://deevy.<subdomain>.workers.dev/api/auth/callback/github` |
| a custom domain           | `https://deevy.example.com`             | `https://deevy.example.com/api/auth/callback/github`             |
| the Docker image          | `https://deevy.example.com`             | `https://deevy.example.com/api/auth/callback/github`             |

A GitHub OAuth App holds one callback URL, so a Worker reachable both on its `workers.dev` subdomain and on a
custom domain needs an App for each, or a decision that sign-in happens on one of them. Move between origins
by changing `wrangler secret put BETTER_AUTH_URL` and the App's callback together: either one alone leaves
sign-in refused by GitHub or the session cookie set for an origin nobody is on.

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

**How a document is fetched, and what is still weak.** Dereferencing a Client ID Metadata Document means
fetching a URL an unknown caller chose, so the transport is the SSRF boundary. Both runtimes refuse every
non-HTTPS scheme, every URL carrying credentials, every host that is not publicly routable by its shape,
every redirect and every response over 128 KB, and bound the request to five seconds. They differ in one
thing, and it is the thing that matters — whether the address checked is the address connected to.

| Target      | Transport                   | How a name is checked                                                                  | Residual risk                                                                                                                                               |
| ----------- | --------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node**    | `apps/server/src/cimd.ts`   | `node:dns` resolves once; every answer must be publicly routable; the first is pinned. | None of this kind. The connection uses the address that passed, with the name kept for the Host header, TLS SNI and certificate validation.                 |
| **Workers** | `packages/core/src/cimd.ts` | A resolver is asked over HTTPS for A and AAAA; any private answer refuses the name.    | A name that answers publicly to the resolver and privately to `fetch` a moment later is not caught. `fetch` resolves the name again and nothing can pin it. |

Node's is wired in as `AuthEnv.fetchClientMetadataResource`, the seam the plugin provides for exactly this.
The Workers pre-resolution asks `https://cloudflare-dns.com/dns-query`; there is no knob for it, and a
deployment that wants a different resolver passes one to `createClientMetadataFetch`.

The Workers gap is a workerd limitation rather than a choice, and M3 measured both ways out before accepting
it. `cf.resolveOverride` only redirects to a host proxied on the Worker's own Cloudflare zone, so it says
nothing about a third party's name. `connect()` from `cloudflare:sockets` can dial a chosen address and still
validate the certificate against the original name, through an undocumented
`startTls({ expectedServerHostname })` — which works in `wrangler dev --local` — but deployed Workers block
outbound TCP to Cloudflare's own IP ranges, and a large share of the internet's CIMD hosts sit behind
Cloudflare. Local workerd blocks neither those ranges nor loopback, so no test on `wrangler dev --local`
could tell a working pin from one that fails only in production. Revisit if Cloudflare documents
`expectedServerHostname` and lifts the IP-range block, or when a Durable Object could hold a socket pool.

Either way the reachable outcome is a blind GET from the instance: nothing of the response is returned to the
caller. Put the instance behind an egress policy if that matters, or pass a stricter transport as
`AuthEnv.fetchClientMetadataResource`.

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

`apps/web/wrangler.jsonc` names the database and deliberately gives no `database_id`. Local D1 works from the
name alone, and the first `wrangler deploy` provisions a database of that name and remembers which one it is,
so there is nothing to paste back into the configuration and nothing account-specific in an open-source
repository — step 3 of [Deploying to a free account](#deploying-to-a-free-account).

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
