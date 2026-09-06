import { describe, expect, it } from "vite-plus/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");

/**
 * `changesets/action` bundles its own copy of the changesets libraries, and its
 * major tracks the CLI's: v1 bundles changesets 2, v2 bundles 3. Running the two
 * out of step works for every ordinary release and fails only in pre-release
 * mode, where the two disagree about the shape of `.changeset/pre.json` — the
 * older code goes looking for changeset files the newer CLI never wrote. That is
 * what killed v0.5.0-rc.0, after four releases had gone out over the same
 * mismatch without complaint (ADR-0017).
 *
 * So the pairing is asserted rather than left as a sentence in a document. These
 * are the pairs the action's own README states; anything else fails
 * deliberately, because whether a future major is compatible is not something
 * this test can infer — it is something somebody has to go and read.
 */
const compatible = new Map([
  [1, 2],
  [2, 3],
]);

async function read(file: string) {
  return readFile(path.join(root, file), "utf8");
}

describe("the changesets pins", () => {
  it("pin an action major that matches the CLI major", async () => {
    const workflow = await read(".github/workflows/changesets.yml");
    const action = /changesets\/action@v(\d+)(?:\.\d+)*/.exec(workflow);
    expect(
      action,
      "No `changesets/action@vN` in .github/workflows/changesets.yml — if the release " +
        "workflow stopped using the action, delete this test with it.",
    ).not.toBeNull();

    const workspace = await read("pnpm-workspace.yaml");
    const cli = /"@changesets\/cli":\s*\^?(\d+)\./.exec(workspace);
    expect(cli, 'No `"@changesets/cli"` entry in pnpm-workspace.yaml\'s catalog.').not.toBeNull();

    const actionMajor = Number(action![1]);
    const cliMajor = Number(cli![1]);

    expect(
      compatible.has(actionMajor),
      `changesets/action@v${actionMajor} is not a version this test knows about. Read the ` +
        `action's README for the changesets major it bundles, add the pair above, and move ` +
        `both pins together.`,
    ).toBe(true);

    expect(
      cliMajor,
      `changesets/action@v${actionMajor} bundles changesets ${compatible.get(actionMajor)}, but ` +
        `the catalog pins @changesets/cli at ${cliMajor}. They must move together: the ` +
        `mismatch is invisible until a release candidate, which is when it breaks (ADR-0017).`,
    ).toBe(compatible.get(actionMajor));
  });

  it("keep the CLI and its changelog generator on one line", async () => {
    // Same family, same reasoning as the @orpc/* and @better-auth/* lines in the
    // catalog: a generator built against a different major of the CLI it plugs
    // into is a runtime error at release time, which is the worst time.
    const workspace = await read("pnpm-workspace.yaml");
    for (const name of ["@changesets/cli", "@changesets/changelog-github"]) {
      expect(workspace, `${name} should be pinned in the catalog`).toContain(`"${name}":`);
    }
  });
});
