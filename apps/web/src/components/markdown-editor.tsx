import { lazy, Suspense, useId, useState } from "react";
import type { EditorMode, Mentionable } from "@/components/tiptap-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  autoFocus?: boolean;
  /** The id a Label points at: it lands on the Source textarea, the plain form control. */
  id?: string;
  "aria-label"?: string;
  /** Rows the Source textarea shows; the rich editor sizes itself. */
  rows?: number;
  className?: string;
}

/**
 * Markdown in, markdown out (docs/plans/ui-redesign.md, "Editing"). Two views
 * of one text: the rich editor, and a Source tab that is a plain textarea —
 * `aria-label="Body"` — so anything the rich view cannot model is still there
 * to read and change, and so a test can type into it in jsdom. The textarea is
 * always mounted; the tab only decides which of the two is shown.
 */
export function MarkdownEditor({
  value,
  onChange,
  mode = "block",
  placeholder,
  mentions,
  onSubmit,
  autoFocus,
  id,
  "aria-label": ariaLabel = "Body",
  rows = 12,
  className,
}: MarkdownEditorProps) {
  const [view, setView] = useState<"edit" | "source">("edit");
  const generated = useId();
  const textareaId = id ?? `${generated}-source`;

  return (
    <div
      data-slot="markdown-editor-frame"
      data-view={view}
      className={cn(
        "flex flex-col rounded-md border border-input bg-input/20 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 dark:bg-input/30",
        className,
      )}
    >
      <div className="flex items-center justify-end border-b px-1">
        <Tabs value={view} onValueChange={(next) => setView(next === "source" ? "source" : "edit")}>
          <TabsList aria-label="Editor view" className="h-7">
            <TabsTrigger value="edit" className="text-xs">
              Edit
            </TabsTrigger>
            <TabsTrigger value="source" className="text-xs">
              Source
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div hidden={view !== "edit"}>
        <Suspense fallback={<Skeleton className="m-3 h-24" />}>
          <TiptapEditor
            value={value}
            onChange={onChange}
            mode={mode}
            {...(placeholder ? { placeholder } : {})}
            {...(mentions ? { mentions } : {})}
            {...(onSubmit ? { onSubmit } : {})}
            {...(autoFocus ? { autoFocus } : {})}
          />
        </Suspense>
      </div>
      <Textarea
        id={textareaId}
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
        className={cn(
          "rounded-none border-0 bg-transparent font-mono text-sm shadow-none focus-visible:ring-0 dark:bg-transparent",
          view !== "source" && "hidden",
        )}
      />
    </div>
  );
}
