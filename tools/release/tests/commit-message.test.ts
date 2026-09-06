import { describe, expect, it } from "vite-plus/test";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../../..");

/**
 * Runs the real commitlint against the real config, through `--edit <file>` —
 * the same path `.husky/commit-msg` takes, so this tests the hook's behaviour
 * and not just the rule table. A rule set with no test is a rule set that gets
 * loosened by whoever it first annoys, and two of these rules exist only because
 * `config-conventional`'s defaults reject this repository's own history
 * (docs/plans/commits-and-changelogs.md).
 */
async function lint(message: string): Promise<{ ok: boolean; output: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "deevy-commitlint-"));
  const file = path.join(dir, "COMMIT_EDITMSG");
  try {
    await writeFile(file, message);
    await run(path.join(root, "node_modules/.bin/commitlint"), ["--edit", file], { cwd: root });
    return { ok: true, output: "" };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("a commit message", { timeout: 30_000 }, () => {
  it("is a conventional subject in the imperative", async () => {
    expect((await lint("feat(gates): add ruling authority to Gate")).ok).toBe(true);
  });

  it("keeps the CONTEXT.md vocabulary's capitals mid-subject", async () => {
    // `subject-case` judges the casing of the whole subject, so a lowercase-initial
    // subject with an embedded proper noun is neither sentence-case nor start-case.
    // Worth asserting rather than assuming: it is the rule everybody expects to
    // fail here, and the reason no workaround was needed.
    expect((await lint("fix(core): a Run waiting on a Gate does not go stale")).ok).toBe(true);
  });

  it("needs no scope", async () => {
    expect((await lint("docs: explain what a changeset is for")).ok).toBe(true);
  });

  it("takes any scope, because there is no enum", async () => {
    expect((await lint("feat(anything-at-all): add a thing")).ok).toBe(true);
  });

  it("rejects a subject with no type", async () => {
    const { ok, output } = await lint("A Gate says who may rule on it");
    expect(ok).toBe(false);
    expect(output).toContain("type-empty");
  });

  it("rejects a type nobody agreed on", async () => {
    const { ok, output } = await lint("wip(core): keep going");
    expect(ok).toBe(false);
    expect(output).toContain("type-enum");
  });

  it("rejects a sentence-case subject", async () => {
    const { ok, output } = await lint("feat(core): Add ruling authority to Gate");
    expect(ok).toBe(false);
    expect(output).toContain("subject-case");
  });

  it("accepts a squash suffix, which GitHub appends to the title", async () => {
    expect((await lint("feat(web): show the Gate a Run is waiting on (#123)")).ok).toBe(true);
  });

  it("accepts an unwrapped paragraph as a body", async () => {
    // 700 characters on one line, which is what recent history actually contains
    // and what `body-max-line-length` at its default would reject.
    const body = "a".repeat(700);
    expect(
      (await lint(`fix(core): stop the sweep from reopening a ruled Gate\n\n${body}`)).ok,
    ).toBe(true);
  });

  it("still rejects a subject longer than the header limit", async () => {
    const { ok, output } = await lint(`feat(core): ${"a".repeat(120)}`);
    expect(ok).toBe(false);
    expect(output).toContain("header-max-length");
  });
});
