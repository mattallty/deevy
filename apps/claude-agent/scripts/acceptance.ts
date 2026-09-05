/**
 * M4's acceptance walk, executed rather than described (docs/m4-acceptance.md).
 *
 * Everything is on this machine: deevy on Node and on workerd, a GitHub OAuth
 * stub, a bare git repository as the remote, and a stub of GitHub's pull-request
 * API. No Cloudflare account, no OAuth App, no repository on the internet.
 *
 * What is real: the supervisor. Discovery, the claim, the envelope, the Gate
 * round trip, the branch, the push, the pull request, the Link and the comment
 * are `apps/claude-agent/src` doing its own job against a deevy over a socket.
 * What is scripted is the model's judgement — and the scripted session writes
 * over `/mcp` with the Agent's key, exactly as Claude would, so the surface is
 * the real one even though the reasoning is not.
 *
 * The one thing this cannot stand in for is Claude itself. That is
 * `tests/live.test.ts`, which is skipped unless DEEVY_AGENT_LIVE=1 and can be
 * pointed at either deployment this script starts.
 *
 *   vp run claude-agent#acceptance              both deployments
 *   vp run claude-agent#acceptance -- --url ... one that is already running
 */
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createDeevy } from "../src/deevy.ts";
import { forgeFor } from "../src/forge.ts";
import type { SessionEvent } from "../src/session.ts";
import { runOnce } from "../src/work.ts";
import { openWorkspace } from "../src/workspace.ts";
import { adminEmail, startNode, startWorkers, type Deployment } from "./boot.ts";

const git = promisify(execFile);
const mcpProtocolVersion = "2026-07-28";
const mcpEnvelope = {
  "io.modelcontextprotocol/protocolVersion": mcpProtocolVersion,
  "io.modelcontextprotocol/clientCapabilities": { elicitation: { url: {} } },
  "io.modelcontextprotocol/clientInfo": { name: "deevy-acceptance", version: "0" },
};

let failures = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`  ok  ${name}`);
  else {
    failures += 1;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  }
}

// ---------------------------------------------------------------- the Human

function cookiesOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/** One Human signing in with GitHub, as the browser would do it. */
async function signIn(origin: string, email: string): Promise<string> {
  const started = await fetch(`${origin}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "github", callbackURL: "/" }),
  });
  const text = await started.text();
  const url = (JSON.parse(text) as { url?: string }).url;
  if (!url)
    throw new Error(`no authorization URL: ${String(started.status)} ${text.slice(0, 200)}`);
  const state = new URL(url).searchParams.get("state") ?? "";
  const callback = await fetch(
    `${origin}/api/auth/callback/github?state=${encodeURIComponent(state)}&code=${encodeURIComponent(email)}`,
    { headers: { cookie: cookiesOf(started) }, redirect: "manual" },
  );
  const cookie = cookiesOf(callback);
  if (!cookie) throw new Error(`sign-in refused: ${callback.headers.get("location") ?? ""}`);
  return cookie;
}

/** One oRPC call over the surface the SPA calls, as the Human. */
async function human(
  origin: string,
  procedure: string,
  input: unknown,
  cookie: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${origin}/rpc/${procedure}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ json: input }),
  });
  const body = await response.text();
  if (response.status !== 200) {
    throw new Error(`${procedure} was ${String(response.status)}: ${body.slice(0, 300)}`);
  }
  return ((JSON.parse(body) as { json?: unknown }).json ?? {}) as Record<string, unknown>;
}

// ---------------------------------------------------------------- the model

/** One tool call over /mcp with the Agent's key, which is all the model ever has. */
async function tool(
  origin: string,
  key: string,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${origin}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": mcpProtocolVersion,
      "mcp-method": "tools/call",
      "mcp-name": name,
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args, _meta: mcpEnvelope },
    }),
  });
  const body = await response.text();
  if (response.status !== 200) {
    throw new Error(`${name} was ${String(response.status)}: ${body.slice(0, 300)}`);
  }
  const answer = JSON.parse(body) as {
    error?: unknown;
    result?: { isError?: boolean; content?: unknown; structuredContent?: unknown };
  };
  if (answer.error) throw new Error(`${name} failed: ${JSON.stringify(answer.error)}`);
  if (answer.result?.isError) {
    throw new Error(`${name} refused: ${JSON.stringify(answer.result.content)}`);
  }
  return (answer.result?.structuredContent ?? {}) as Record<string, unknown>;
}

const ready: SessionEvent = {
  type: "ready",
  tools: [],
  servers: [{ name: "deevy", status: "connected" }],
};

// ------------------------------------------------------------- the outside

interface StubForge {
  api: string;
  opened: Array<{ slug: string; head: string; base: string }>;
  close(): Promise<void>;
}

/** GitHub's pull-request endpoint, as far as the runtime can tell. */
async function stubForge(): Promise<StubForge> {
  const opened: StubForge["opened"] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const match = /^\/repos\/(.+)\/pulls$/.exec(request.url ?? "");
      if (request.method !== "POST" || !match) {
        response.writeHead(404).end("{}");
        return;
      }
      const sent = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        head: string;
        base: string;
      };
      opened.push({ slug: match[1] ?? "", head: sent.head, base: sent.base });
      response.writeHead(201, { "content-type": "application/json" }).end(
        JSON.stringify({
          html_url: `https://forge.test/pull/${String(opened.length)}`,
          number: opened.length,
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    api: `http://127.0.0.1:${String(port)}`,
    opened,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

/** A bare repository with one commit on `main`, to clone from and push to. */
async function remote(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "deevy-acceptance-repo-"));
  const bare = join(dir, "origin.git");
  const seed = join(dir, "seed");
  await git("git", ["init", "--bare", "--initial-branch", "main", "--quiet", bare]);
  await git("git", ["clone", "--quiet", bare, seed]);
  await git("git", ["-C", seed, "config", "user.email", "seed@deevy.test"]);
  await git("git", ["-C", seed, "config", "user.name", "seed"]);
  await writeFile(join(seed, "README.md"), "# the repository the Agent works in\n");
  await git("git", ["-C", seed, "add", "-A"]);
  await git("git", ["-C", seed, "commit", "--quiet", "-m", "first"]);
  await git("git", ["-C", seed, "push", "--quiet", "origin", "main"]);
  return bare;
}

// ----------------------------------------------------------------- the walk

export async function walk(origin: string, label: string): Promise<string> {
  console.log(`\n${label} — ${origin}`);
  const cookie = await signIn(origin, adminEmail);
  const forge = await stubForge();
  const repoUrl = await remote();

  try {
    // Part 1: what a Human sets up, all of it over the surface the SPA calls.
    const project = await human(
      origin,
      "projects/create",
      { name: "Planning", key: "PLN" },
      cookie,
    );
    const planner = await human(origin, "agents/create", { name: "Planner" }, cookie);
    const plannerId = String(planner.id);
    await human(
      origin,
      "agents/grants/add",
      { memberId: plannerId, projectId: project.id },
      cookie,
    );
    const key = String(
      (
        await human(
          origin,
          "agents/keys/issue",
          { memberId: plannerId, name: "acceptance" },
          cookie,
        )
      ).key,
    );

    const issue = await human(
      origin,
      "issues/create",
      { projectKey: "PLN", title: "Give the runtime a health endpoint" },
      cookie,
    );
    const issueKey = String(issue.key);
    await human(
      origin,
      "documents/write",
      {
        issueKey,
        name: "intent",
        body: "## Problem\n\nAn operator cannot tell whether the runtime is alive.\n",
      },
      cookie,
    );
    await human(origin, "gates/approve", { key: issueKey }, cookie);
    await human(origin, "gates/approve", { key: issueKey }, cookie);
    await human(origin, "issues/update", { key: issueKey, assigneeMemberId: plannerId }, cookie);

    // Everything below is the runtime's own code, against this deployment.
    const config = {
      url: origin,
      key,
      pollSeconds: 1,
      runTimeoutSeconds: 120,
      model: "scripted",
      effort: "high" as const,
      maxTurns: 10,
      repo: { url: repoUrl, token: "acceptance-token", baseBranch: "main" },
      githubApi: forge.api,
      githubRepo: "deevy/acceptance",
      listenPort: 0,
    };
    const deevy = createDeevy({ config });
    const work = {
      deevy,
      runTimeoutMs: 120_000,
      forge: forgeFor(config),
      workspace: (options: { runId: string }) => openWorkspace({ ...options, repo: config.repo }),
    };

    check(
      "the runtime is the Agent, and says which Member",
      (await deevy.me()).memberId === plannerId,
    );

    // Part 2: the first pass. The model writes the plan and stops at the Gate.
    let runId = "";
    const planned = await runOnce({
      ...work,
      session: async function* () {
        yield ready;
        const mine = (await tool(origin, key, "runs_list", { status: "pending" })).runs as Array<{
          id: string;
        }>;
        runId = mine[0]?.id ?? "";
        await tool(origin, key, "runs_post_activity", {
          runId,
          kind: "thought",
          body: "Reading the intent",
        });
        await tool(origin, key, "documents_get", { issueKey, name: "intent" });
        await tool(origin, key, "documents_write", {
          issueKey,
          name: "plan",
          body: "## Files that change\n\n- src/health.ts\n\n## Tests that prove it\n\n- a smoke\n",
        });
        await tool(origin, key, "runs_request_approval", { runId });
        yield { type: "done", ok: true, detail: "asked" };
      },
    });

    check(
      "the trigger's Run is taken up and stops at the Gate",
      planned.worked.length === 1 && planned.worked[0]?.status === "awaiting_input",
      JSON.stringify(planned.worked),
    );
    check(
      "nothing is delivered by a Run that only asked",
      planned.worked[0]?.delivered === undefined,
    );
    const waiting = (await human(origin, "runs/get", { runId }, cookie)).activities as Array<{
      kind: string;
    }>;
    check(
      "the Human is offered a deevy URL to decide it",
      waiting.some((activity) => activity.kind === "elicitation"),
      JSON.stringify(waiting.map((a) => a.kind)),
    );

    // A pass that finds a Run waiting on a Human leaves it exactly there.
    const untouched = await runOnce({
      ...work,
      session: async function* () {
        yield ready;
        throw new Error("a Run waiting on a Human is not the runtime's to work");
      },
    });
    check(
      "a Run nobody has ruled on is reported, not worked",
      untouched.worked.length === 0 &&
        untouched.resumed.length === 0 &&
        untouched.waiting.length === 1,
      JSON.stringify(untouched),
    );

    // Part 3: the Human rules, in deevy, and the loop carries on.
    await human(origin, "gates/approve", { key: issueKey, note: "Looks right, build it" }, cookie);

    let resumePrompt = "";
    const built = await runOnce({
      ...work,
      session: async function* (input) {
        resumePrompt = input.prompt;
        yield ready;
        await writeFile(join(input.cwd, "src-health.ts"), "export const ok = true;\n");
        await tool(origin, key, "runs_post_activity", {
          runId,
          kind: "action",
          body: "Wrote the health endpoint",
        });
        await tool(origin, key, "runs_finish", {
          runId,
          status: "completed",
          summary: "Added a health endpoint and a smoke for it",
        });
        yield { type: "done", ok: true, detail: "built" };
      },
    });

    check(
      "the ruling hands the Run back and it finishes",
      built.resumed.length === 1 && built.resumed[0]?.status === "completed",
      JSON.stringify(built.resumed),
    );
    check(
      "the resumed session is told what was decided, and what the Human said",
      resumePrompt.includes("approved the Plan Gate") &&
        resumePrompt.includes("Looks right, build it"),
      resumePrompt,
    );

    // Part 4: the evidence, on the remote and on the Issue.
    const branch = built.resumed[0]?.delivered?.branch ?? "";
    const branches = (await git("git", ["-C", repoUrl, "branch", "--list"])).stdout;
    check(
      "a branch named after the attempt is on the remote, and main is untouched",
      branch.startsWith(`deevy/${issueKey.toLowerCase()}-`) && branches.includes(branch),
      `${branch} in ${branches.replaceAll("\n", " ")}`,
    );
    check(
      "a pull request was opened against the base branch",
      forge.opened.length === 1 &&
        forge.opened[0]?.slug === "deevy/acceptance" &&
        forge.opened[0]?.head === branch &&
        forge.opened[0]?.base === "main",
      JSON.stringify(forge.opened),
    );

    const links = (await human(origin, "links/list", { issueKey }, cookie)).links as Array<{
      kind: string;
      url: string;
      runId: string | null;
    }>;
    check(
      "the pull request is a Link on the Issue, attributed to the Run that produced it",
      links.length === 1 && links[0]?.kind === "pull_request" && links[0]?.runId === runId,
      JSON.stringify(links),
    );
    const comments = (await human(origin, "comments/list", { issueKey }, cookie))
      .comments as Array<{
      body: string;
    }>;
    check(
      "a comment names the branch and the pull request",
      comments.some(
        (comment) => comment.body.includes(branch) && comment.body.includes("forge.test/pull/"),
      ),
      JSON.stringify(comments.map((c) => c.body)),
    );

    // Part 5: what the record has to say.
    const all = (await human(origin, "events/list", { limit: 100 }, cookie)).events as Array<{
      kind: string;
      actorMemberId: string | null;
    }>;
    // From the trigger onward: the two approvals before it are the Human
    // setting the Issue up, not part of what the runtime did.
    const events = all.slice(all.findIndex((event) => event.kind === "run.started"));
    const story = events.map((event) => event.kind).join(" ");
    check(
      "the Event log tells the story of the Run from the trigger to the finish",
      story ===
        "run.started run.activity document.updated run.activity run.awaiting_input " +
          "gate.approved run.answered run.activity run.activity run.completed " +
          "issue.link_added comment.created",
      story,
    );
    // Three of these are the Human's, and each for the right reason:
    // `run.started` records the Member whose assignment triggered it,
    // `gate.approved` the ruling, and `run.answered` that ruling reaching the
    // Run. Everything else is the Agent acting as itself.
    const humans = new Set(["run.started", "gate.approved", "gate.rejected", "run.answered"]);
    check(
      "the Agent is the actor throughout, and the Human exactly one hop away",
      events.every((event) =>
        humans.has(event.kind)
          ? event.actorMemberId !== plannerId
          : event.actorMemberId === plannerId,
      ),
      JSON.stringify(events.map((event) => [event.kind, event.actorMemberId === plannerId])),
    );

    const plan = await human(origin, "documents/get", { issueKey, name: "plan" }, cookie);
    check(
      "the plan Document on the Issue is the one the Agent wrote",
      String(plan.body).includes("## Files that change"),
      JSON.stringify(plan).slice(0, 200),
    );
    return story;
  } finally {
    await forge.close();
  }
}

async function main(): Promise<void> {
  const given = process.argv.indexOf("--url");
  if (given !== -1) {
    await walk(process.argv[given + 1] ?? "", "an instance that is already running");
  } else {
    // Both deployments, from one codebase, and the runtime cannot tell them
    // apart: that is the claim ADR-0006 makes and this is what checks it.
    const stories: Record<string, string> = {};
    for (const start of [startNode, startWorkers]) {
      let deployment: Deployment | null = null;
      try {
        deployment = await start();
        stories[deployment.name] = await walk(deployment.origin, `deevy on ${deployment.name}`);
      } finally {
        deployment?.stop();
      }
    }
    console.log("");
    check(
      "the same walk leaves the same Event log on both deployments",
      stories.node !== undefined && stories.node === stories.workers,
      `node:    ${stories.node ?? "(none)"}\nworkers: ${stories.workers ?? "(none)"}`,
    );
  }
  console.log(
    failures === 0
      ? "\nacceptance: every check passed"
      : `\nacceptance: ${String(failures)} failed`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

await main();
