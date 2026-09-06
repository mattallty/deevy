import { describe, expect, it } from "vite-plus/test";
import { movedRefs, refsFrom, sentenceFor } from "../src/refs.ts";

const sha = (n: string) => n.repeat(40).slice(0, 40);

/** History that only ever moves forward, so nothing is a rewrite. */
const fastForward = () => Promise.resolve(true);

describe("what a Run moved", () => {
  it("names a branch the Run created", async () => {
    const moved = await movedRefs({
      before: new Map([["refs/heads/main", sha("a")]]),
      after: new Map([
        ["refs/heads/main", sha("a")],
        ["refs/heads/feature", sha("b")],
      ]),
      isAncestor: fastForward,
    });

    expect(moved).toEqual([
      { ref: "refs/heads/feature", from: null, to: sha("b"), rewritten: false },
    ]);
  });

  it("says when a branch was rewritten rather than moved forward", async () => {
    const moved = await movedRefs({
      before: new Map([["refs/heads/main", sha("a")]]),
      after: new Map([["refs/heads/main", sha("c")]]),
      // The commit that was there is not in the history of the one that is.
      isAncestor: () => Promise.resolve(false),
    });

    expect(moved).toEqual([
      { ref: "refs/heads/main", from: sha("a"), to: sha("c"), rewritten: true },
    ]);
  });

  it("names a branch the Run deleted, which is the sharpest way to lose work", async () => {
    const moved = await movedRefs({
      before: new Map([
        ["refs/heads/main", sha("a")],
        ["refs/heads/old", sha("b")],
      ]),
      after: new Map([["refs/heads/main", sha("a")]]),
      isAncestor: fastForward,
    });

    expect(moved).toEqual([{ ref: "refs/heads/old", from: sha("b"), to: null, rewritten: true }]);
  });

  it("says nothing about a Run that moved nothing", async () => {
    const same = new Map([["refs/heads/main", sha("a")]]);

    expect(await movedRefs({ before: same, after: same, isAncestor: fastForward })).toEqual([]);
  });
});

describe("reading a remote", () => {
  it("takes the refs out of what git ls-remote prints", () => {
    const printed = [
      `${sha("a")}\tHEAD`,
      `${sha("a")}\trefs/heads/main`,
      `${sha("b")}\trefs/heads/feature`,
      `${sha("c")}\trefs/tags/v1`,
      // The tag's own commit, which is the tag repeated rather than a ref.
      `${sha("d")}\trefs/tags/v1^{}`,
      "",
    ].join("\n");

    expect(refsFrom(printed)).toEqual(
      new Map([
        ["refs/heads/main", sha("a")],
        ["refs/heads/feature", sha("b")],
        ["refs/tags/v1", sha("c")],
      ]),
    );
  });
});

describe("what a Human reads", () => {
  it("says a branch was pushed", () => {
    expect(
      sentenceFor({ ref: "refs/heads/feature", from: null, to: sha("b"), rewritten: false }),
    ).toBe("Pushed refs/heads/feature at bbbbbbb");
  });

  it("says a branch moved forward, and from where", () => {
    expect(
      sentenceFor({ ref: "refs/heads/main", from: sha("a"), to: sha("b"), rewritten: false }),
    ).toBe("Moved refs/heads/main from aaaaaaa to bbbbbbb");
  });

  it("says plainly when history was rewritten", () => {
    expect(
      sentenceFor({ ref: "refs/heads/main", from: sha("a"), to: sha("c"), rewritten: true }),
    ).toBe("Rewrote refs/heads/main from aaaaaaa to ccccccc, which is not a fast-forward");
  });

  it("says when a branch was deleted, and what was on it", () => {
    expect(sentenceFor({ ref: "refs/heads/old", from: sha("b"), to: null, rewritten: true })).toBe(
      "Deleted refs/heads/old, which was at bbbbbbb",
    );
  });
});
