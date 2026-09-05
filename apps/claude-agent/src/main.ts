import { readConfig } from "./config.ts";
import { DeevyError, createDeevy } from "./deevy.ts";
import { forgeFor } from "./forge.ts";
import { startLoop } from "./loop.ts";
import { buildSession } from "./sdk.ts";
import { runOnce } from "./work.ts";
import { openWorkspace } from "./workspace.ts";

/**
 * The reference runtime, as a process.
 *
 * `--once` makes one pass and exits, which is what a cron, a person debugging,
 * and the container smoke all want. Without it the loop stays up, which is the
 * shape M4 chose over a CI job: an agent that thinks for twenty minutes bills
 * twenty minutes of runner time, and a Run stopped at a Gate may wait days
 * (docs/plans/m4.md).
 */
function configOrExit() {
  try {
    return readConfig();
  } catch (error) {
    // A stack trace for a missing environment variable helps nobody: the whole
    // of what an operator needs is the name of the one that is not set.
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

const config = configOrExit();
const deevy = createDeevy({ config });
const work = {
  deevy,
  session: buildSession(config),
  runTimeoutMs: config.runTimeoutSeconds * 1000,
  forge: forgeFor(config.repo),
  workspace: (options: { runId: string }) =>
    openWorkspace({
      ...options,
      repo: config.repo,
      ...(config.workdir ? { root: config.workdir } : {}),
    }),
};

/**
 * Who this key is, before anything else. A runtime that cannot say which Member
 * it is has nothing to poll for, and failing here with deevy's own word for the
 * refusal beats a loop that quietly finds no work forever.
 */
const who = await deevy.me().catch((error: unknown) => {
  if (error instanceof DeevyError) {
    console.error(`deevy refused this key: ${error.code} ${error.message}`);
  } else {
    console.error(`deevy is unreachable at ${config.url}: ${String(error)}`);
  }
  process.exit(1);
});
console.log(`deevy runtime is Member ${who.memberId} at ${config.url}`);

if (process.argv.includes("--once")) {
  const pass = await runOnce(work);
  console.log(`one pass: worked ${pass.worked.length}, waiting ${pass.waiting.length}`);
  process.exit(0);
}

const loop = startLoop({
  ...work,
  pollSeconds: config.pollSeconds,
  onPass: (pass) => {
    for (const result of [...pass.resumed, ...pass.worked]) {
      console.log(
        `${result.issueKey} ${result.status}${result.failedBy ? `: ${result.failedBy}` : ""}`,
      );
    }
  },
});

// A stop with a Run in flight aborts the session, and `workRun` then writes the
// error Activity and fails the Run before this resolves. A container restart
// must not leave a Run `active` and silent for half an hour until deevy's sweep
// calls it stale, which tells a Human nothing about why.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    console.log(`${signal}: finishing the Run in flight`);
    void loop.stop().then(() => process.exit(0));
  });
}

await loop.done;
