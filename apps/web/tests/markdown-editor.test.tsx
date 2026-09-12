import { Editor } from "@tiptap/core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { Markdown, proseClassName } from "../src/components/markdown.tsx";
import { MarkdownEditor } from "../src/components/markdown-editor.tsx";
import { editorExtensions, Toolbar, toMarkdown } from "../src/components/tiptap-editor.tsx";

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

/**
 * The selectors `proseClassName` lays a task item out as a row with: every
 * `[&_<selector>]:flex` class, `_` standing for a space. jsdom has no layout,
 * so a test checks that the item each renderer emits is one those match.
 */
function rowSelectors(): string[] {
  const suffix = "]:flex";
  return proseClassName
    .split(" ")
    .filter((name) => name.startsWith("[&_") && name.endsWith(suffix))
    .map((name) => name.slice("[&_".length, -suffix.length).replaceAll("_", " "));
}

describe("a task list", () => {
  const source = "- [ ] the cursor\n- [x] the table";

  it("is rows in the editor: each item one li the prose classes lay out, checkbox first", async () => {
    render(<MarkdownEditor value={source} onChange={() => {}} />);
    const rich = await screen.findByRole("textbox");
    await waitFor(() => expect(rich.querySelectorAll("li")).toHaveLength(2));
    const items = [...rich.querySelectorAll("li")];
    expect(items.map((li) => li.textContent?.trim())).toEqual([
      expect.stringContaining("the cursor"),
      expect.stringContaining("the table"),
    ]);
    for (const li of items) {
      // Tiptap's node view: `li > label > input` then `li > div > p` — and the
      // li carries no data-type, which is what once left the checkbox stacked
      // above its text.
      expect(li.querySelector(":scope > label > input[type=checkbox]")).toBeTruthy();
      expect(li.querySelector(":scope > div > p")).toBeTruthy();
      expect(rowSelectors().some((selector) => li.matches(selector))).toBe(true);
    }
    expect(items[1]?.querySelector<HTMLInputElement>("input")?.checked).toBe(true);
  });

  it("is rows when read: remark-gfm's li is one the same prose classes lay out", () => {
    const { container } = render(<Markdown>{source}</Markdown>);
    const items = [...container.querySelectorAll("li")];
    expect(items).toHaveLength(2);
    for (const li of items) {
      expect(li.querySelector(":scope > input[type=checkbox]")).toBeTruthy();
      expect(rowSelectors().some((selector) => li.matches(selector))).toBe(true);
    }
    expect(items[1]?.querySelector<HTMLInputElement>("input")?.checked).toBe(true);
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

  it("emits what is typed into the markdown underneath, and ⌘Enter submits", () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(<MarkdownEditor value="" onChange={onChange} onSubmit={onSubmit} mode="inline" />);

    // The hidden textarea: the same text as the editor, and the one a test can
    // type into. There is no tab to reach it by any more.
    const source = screen.getByLabelText("Body", { selector: "textarea" });
    fireEvent.change(source, { target: { value: "A note" } });
    expect(onChange).toHaveBeenCalledWith("A note");
    fireEvent.keyDown(source, { key: "Enter", metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("turns the selection into what the bubble's buttons say", () => {
    const editor = new Editor({
      extensions: editorExtensions({ mode: "block" }),
      content: "Some words",
      contentType: "markdown",
    });
    render(<Toolbar editor={editor} />);
    const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
    editor.commands.selectAll();

    fireEvent.click(within(toolbar).getByRole("button", { name: "Bold" }));
    expect(editor.isActive("bold")).toBe(true);
    // `focus()` in a chain puts the caret back where jsdom thinks it is, so
    // the selection is made again rather than assumed to survive.
    editor.commands.selectAll();
    fireEvent.click(within(toolbar).getByRole("button", { name: "Heading 2" }));
    // What the Document would be saved as, which is the thing that matters:
    // `isActive` is false for a selection that runs past the heading.
    expect(toMarkdown(editor).trim()).toBe("## **Some words**");

    // Inserting a table or a divider is not something a selection becomes:
    // those live in the `/` menu, and the bubble does not carry them.
    expect(within(toolbar).queryByRole("button", { name: "Table" })).toBeNull();
    expect(within(toolbar).queryByRole("button", { name: "Divider" })).toBeNull();
    editor.destroy();
  });

  it("keeps no toolbar in the flow: formatting is a bubble over the selection", async () => {
    const block = render(<MarkdownEditor value="x" onChange={() => {}} />);
    await waitFor(() => expect(document.querySelector(".tiptap")).toBeTruthy());
    // The bubble exists only while something is selected, so an editor nobody
    // has selected anything in carries no toolbar at all — which is the point.
    expect(screen.queryByRole("toolbar")).toBeNull();
    block.unmount();

    render(<MarkdownEditor value="x" onChange={() => {}} mode="inline" />);
    await waitFor(() => expect(document.querySelector(".tiptap")).toBeTruthy());
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("names the rich textbox, and is the only textbox anything can see", async () => {
    render(<MarkdownEditor id="body" aria-label="Comment" value="" onChange={() => {}} />);
    const rich = await screen.findByRole("textbox", { name: "Comment" });
    expect(rich.classList.contains("tiptap")).toBe(true);
    // The id is the editor's: it is the control a Label points at, and now the
    // only one on screen. The textarea under it is hidden, so nothing asking by
    // role is offered two places to write the same text.
    expect(rich.id).toBe("body");
    expect(screen.getAllByRole("textbox", { name: "Comment" })).toHaveLength(1);
    expect(screen.getByLabelText("Comment", { selector: "textarea" }).id).not.toBe("body");
    expect(screen.queryByRole("tab", { name: "Source" })).toBeNull();
  });
});
