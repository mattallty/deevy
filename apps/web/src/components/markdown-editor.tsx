import { lazy, Suspense, useId } from "react";
import type { EditorMode, Mentionable } from "@/components/tiptap-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Tiptap is the heaviest thing in the SPA and a list never needs it.
const TiptapEditor = lazy(() => import("@/components/tiptap-editor"));

export type { EditorMode, Mentionable };

export interface MarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  /** `block` for Documents and descriptions; `inline` for comments, notes and answers. */
  mode?: EditorMode;
  placeholder?: string;
  mentions?: Mentionable[];
  /** ⌘Enter. */
  onSubmit?: () => void;
  /**
   * Focus leaving the editor altogether. What a Document saves on, so writing
   * is not a mode you enter and leave with a button.
   */
  onBlur?: () => void;
  autoFocus?: boolean;
  /** The id a Label points at. It lands on the rich editor, which is the one on screen. */
  id?: string;
  "aria-label"?: string;
  /** Rows the hidden textarea holds; the rich editor sizes itself. */
  rows?: number;
  className?: string;
}

/**
 * Markdown in, markdown out (docs/plans/ui-redesign.md, "Editing"). The rich
 * editor is the editor: there is no Edit/Source switch on it, because a pair of
 * tabs above every Document, description and comment is a choice nobody was
 * making and chrome on every reading of them.
 *
 * The plain textarea underneath stays mounted and hidden. It is the same text
 * — `value` drives both — and it is the path a test types through, Tiptap
 * being a ProseMirror instance jsdom cannot be made to type into. Both carry
 * the accessible name, so a test asks for the textarea with
 * `{ selector: "textarea" }` and gets the markdown exactly as it is stored.
 */
export function MarkdownEditor({
  value,
  onChange,
  mode = "block",
  placeholder,
  mentions,
  onSubmit,
  onBlur,
  autoFocus,
  id,
  "aria-label": ariaLabel = "Body",
  rows = 12,
  className,
}: MarkdownEditorProps) {
  const generated = useId();

  return (
    <div
      data-slot="markdown-editor-frame"
      onBlur={(left) => {
        // Only when focus has gone somewhere else entirely: a popup of the
        // editor's own — the `/` menu, a mention list — is still being in it.
        if (!left.currentTarget.contains(left.relatedTarget as Node | null)) onBlur?.();
      }}
      className={cn(
        "flex flex-col rounded-md border border-input bg-input/20 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 dark:bg-input/30",
        className,
      )}
    >
      <Suspense fallback={<Skeleton className="m-3 h-24" />}>
        <TiptapEditor
          value={value}
          onChange={onChange}
          mode={mode}
          aria-label={ariaLabel}
          {...(id ? { id } : {})}
          {...(placeholder ? { placeholder } : {})}
          {...(mentions ? { mentions } : {})}
          {...(onSubmit ? { onSubmit } : {})}
          {...(autoFocus ? { autoFocus } : {})}
        />
      </Suspense>
      {/*
       * The markdown underneath, hidden: the same text as the editor above it,
       * and the only one a test can type into — Tiptap is a ProseMirror view
       * and jsdom has no layout to give it. `hidden` is the attribute rather
       * than a class, so nothing asking by role finds a second textbox, while a
       * label still reaches it.
       */}
      <Textarea
        hidden
        id={`${generated}-source`}
        aria-label={ariaLabel}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(changed) => onChange(changed.target.value)}
        onKeyDown={(pressed) => {
          if (onSubmit && pressed.key === "Enter" && (pressed.metaKey || pressed.ctrlKey)) {
            pressed.preventDefault();
            onSubmit();
          }
        }}
        className="hidden"
      />
    </div>
  );
}
