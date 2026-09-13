import * as Y from "yjs";
import { describe, expect, it } from "vite-plus/test";
import { loadMarkdown, markdownOf } from "../src/index.ts";

/** Markdown in, a live document, markdown out: what a version is made of. */
function through(markdown: string): string {
  const doc = new Y.Doc();
  loadMarkdown(doc, markdown);
  return markdownOf(doc);
}

describe("a Document as a room holds it", () => {
  it("keeps the shapes a Document is written in", () => {
    for (const markdown of [
      "## Problem\n\nCheckout is four screens.",
      "- one\n- two\n- three",
      "1. first\n2. second",
      "> a quote",
      "`inline code` and **bold** and *italic*",
      "```ts\nconst a = 1;\n```",
      "A [link](https://deevy.test) in a sentence.",
      "---",
    ]) {
      expect(through(markdown)).toBe(markdown);
    }
  });

  it("is empty when there is nothing in it", () => {
    expect(markdownOf(new Y.Doc())).toBe("");
    expect(through("")).toBe("");
  });

  it("carries what two Members typed into one Document", () => {
    // The whole point of the room: two replicas, merged, serialised once.
    const ada = new Y.Doc();
    loadMarkdown(ada, "## Problem\n\nCheckout is four screens.");

    const grace = new Y.Doc();
    Y.applyUpdate(grace, Y.encodeStateAsUpdate(ada));

    // Each of them writes a paragraph the other has not seen.
    const intoAda = new Y.Doc();
    Y.applyUpdate(intoAda, Y.encodeStateAsUpdate(ada));
    loadMarkdown(intoAda, "## Problem\n\nCheckout is four screens.\n\nAda's line.");

    Y.applyUpdate(ada, Y.encodeStateAsUpdate(intoAda));
    Y.applyUpdate(grace, Y.encodeStateAsUpdate(ada));

    expect(markdownOf(grace)).toBe(markdownOf(ada));
    expect(markdownOf(grace)).toContain("Ada's line.");
  });

  it("changes nothing when the markdown it is given is the markdown it has", () => {
    // Loading is how an Agent's write reaches a live room, so a write that
    // changes nothing must leave the document — and its history — alone.
    const doc = new Y.Doc();
    loadMarkdown(doc, "## Problem\n\nOne line.");
    const before = Y.encodeStateAsUpdate(doc).length;

    loadMarkdown(doc, "## Problem\n\nOne line.");

    expect(markdownOf(doc)).toBe("## Problem\n\nOne line.");
    expect(Y.encodeStateAsUpdate(doc).length).toBe(before);
  });
});
