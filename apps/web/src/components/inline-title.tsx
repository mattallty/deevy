import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A title that is edited where it is read, the way a Document is
 * (`issue-documents.tsx`): no Edit button, no form, no second copy of the
 * words on screen. `Enter` or moving on saves it, `Escape` puts back what was
 * there.
 *
 * It is the `h1` itself that is editable rather than an input dressed as one.
 * A heading's accessible name comes from its text, and an `<input>` inside it
 * would take the words out of that name — the page would stop having a
 * heading anybody could find by its title, which is how it is found.
 *
 * React must not own the children. The text belongs to the DOM once the
 * element is editable, so the initial value is rendered once from a ref (a
 * re-render with an unchanged string leaves the DOM alone) and a later change
 * from the server is written in by hand, never while somebody is typing in it.
 */
export function InlineTitle({
  value,
  onSave,
  className,
}: {
  value: string;
  /** Called with the trimmed text when it has actually changed. */
  onSave: (next: string) => void;
  className?: string;
}) {
  const field = useRef<HTMLHeadingElement>(null);
  const initial = useRef(value);

  useEffect(() => {
    const element = field.current;
    if (!element || document.activeElement === element) return;
    if (element.textContent !== value) element.textContent = value;
  }, [value]);

  /** The text the server has, or the text just sent to it: what not to resend. */
  const committed = useRef(value);
  useEffect(() => {
    committed.current = value;
  }, [value]);

  const revert = () => {
    if (field.current) field.current.textContent = committed.current;
  };

  /**
   * Save what is in the element, if it is worth saving. `Enter` does this and
   * then gives up focus, rather than leaving the save to the blur that
   * follows: a keystroke that saves should save, whatever the browser decides
   * about focus afterwards — and the two together must not save twice, which
   * is what `committed` is for.
   */
  const commit = () => {
    const next = (field.current?.textContent ?? "").trim();
    // An Issue with no title is not an edit, it is a mistake: put the old one
    // back rather than saving nothing.
    if (next === "") return revert();
    if (next === committed.current) return;
    committed.current = next;
    onSave(next);
  };

  return (
    <h1
      ref={field}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      // The name says what the words are for; the words themselves are still
      // the heading's own text, so a test and a screen reader both find it.
      data-slot="issue-title"
      className={cn(
        "min-w-0 rounded-sm text-xl font-semibold tracking-tight outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring/40",
        className,
      )}
      onKeyDown={(pressed) => {
        if (pressed.key === "Enter") {
          // A title is one line. Enter means "done", not a paragraph break.
          pressed.preventDefault();
          commit();
          field.current?.blur();
        } else if (pressed.key === "Escape") {
          pressed.preventDefault();
          revert();
          field.current?.blur();
        }
      }}
      onPaste={(pasted) => {
        // Whatever was copied arrives as one line of plain text: a heading that
        // silently holds bold HTML from another page is a surprise later.
        pasted.preventDefault();
        const text = pasted.clipboardData.getData("text/plain").replace(/\s+/g, " ").trim();
        pasted.currentTarget.ownerDocument.execCommand("insertText", false, text);
      }}
      onBlur={commit}
    >
      {initial.current}
    </h1>
  );
}
