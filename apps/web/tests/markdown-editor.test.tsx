import { Editor } from "@tiptap/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { MarkdownEditor } from "../src/components/markdown-editor.tsx";
import { editorExtensions, toMarkdown } from "../src/components/tiptap-editor.tsx";

/** Markdown in, through exactly the extensions the component uses, markdown out. */
function roundTrip(markdown: string, mode: "block" | "inline" = "block"): string {
  const editor = new Editor({
    extensions: editorExtensions({ mode }),
    content: markdown,
    contentType: "markdown",
  });
  const out = toMarkdown(editor);
  editor.destroy();
  return out;
}

describe("the markdown round trip", () => {
  it("keeps headings, emphasis, lists, code and a mention as text", () => {
    const source = [
      "# Intent",
      "",
      "## Problem",
      "",
      "The log has **no** reader, said @ada to `sqlite3`.",
      "",
      "- one",
      "- two",
      "",
      "1. first",
      "2. second",
      "",
      "```ts",
      "const x = 1;",
      "```",
    ].join("\n");
    const out = roundTrip(source);
    for (const line of [
      "# Intent",
      "## Problem",
      "**no**",
      "@ada",
      "`sqlite3`",
      "- one",
      "- two",
      "1. first",
      "2. second",
      "```ts",
      "const x = 1;",
    ]) {
      expect(out).toContain(line);
    }
    // And a second pass changes nothing: the serializer is a fixed point.
    expect(roundTrip(out)).toBe(out);
  });

  it("keeps GFM tables and task lists", () => {
    const source = [
      "| Files | Order |",
      "| --- | --- |",
      "| events.ts | 1 |",
      "",
      "- [ ] the cursor",
      "- [x] the table",
    ].join("\n");
    // The serializer pads a table's columns to align them; the words are what matter.
    const out = roundTrip(source).replace(/ +/g, " ");
    expect(out).toContain("| Files | Order |");
    expect(out).toContain("| events.ts | 1 |");
    expect(out).toContain("- [ ] the cursor");
    expect(out).toContain("- [x] the table");
  });

  it("holds an inline comment as a paragraph", () => {
    expect(roundTrip("Looks right, @planner — ship it.", "inline")).toBe(
      "Looks right, @planner — ship it.",
    );
  });
});

describe("MarkdownEditor", () => {
  it("shows the text in a Source textarea named Body, and an untouched load emits nothing", async () => {
    const onChange = vi.fn();
    render(<MarkdownEditor value={"## Problem\n\nNo reader."} onChange={onChange} />);

    const source = screen.getByLabelText("Body", { selector: "textarea" }) as HTMLTextAreaElement;
    expect(source.value).toBe("## Problem\n\nNo reader.");
    // The rich editor mounts (lazily) and does not re-serialize on load.
    await waitFor(() => expect(document.querySelector(".tiptap")).toBeTruthy());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("emits what is typed into Source, and ⌘Enter submits", () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(<MarkdownEditor value="" onChange={onChange} onSubmit={onSubmit} mode="inline" />);

    fireEvent.click(screen.getByRole("tab", { name: "Source" }));
    const source = screen.getByLabelText("Body", { selector: "textarea" });
    fireEvent.change(source, { target: { value: "A note" } });
    expect(onChange).toHaveBeenCalledWith("A note");
    fireEvent.keyDown(source, { key: "Enter", metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("has a toolbar in block mode and none inline", async () => {
    const block = render(<MarkdownEditor value="x" onChange={() => {}} />);
    expect(await screen.findByRole("toolbar", { name: "Formatting" })).toBeTruthy();
    block.unmount();

    render(<MarkdownEditor value="x" onChange={() => {}} mode="inline" />);
    await waitFor(() => expect(document.querySelector(".tiptap")).toBeTruthy());
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("names the rich textbox and points the id at the view that is showing", async () => {
    render(<MarkdownEditor id="body" aria-label="Comment" value="" onChange={() => {}} />);
    const rich = await screen.findByRole("textbox", { name: "Comment" });
    expect(rich.classList.contains("tiptap")).toBe(true);
    expect(rich.id).toBe("body");
    expect(screen.getByLabelText("Comment", { selector: "textarea" }).id).not.toBe("body");

    fireEvent.click(screen.getByRole("tab", { name: "Source" }));
    expect(screen.getByLabelText("Comment", { selector: "textarea" }).id).toBe("body");
    expect(rich.id).toBe("");
  });
});
