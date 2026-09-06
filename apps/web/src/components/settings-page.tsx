import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

/**
 * The frame every Settings page uses, so eleven hand-rolled layouts become one
 * (docs/plans/ui-redesign.md slice 9): the h1 a test finds the page by, one
 * line on what it is for, the page's action on the right, then sections.
 */
export function SettingsPage({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-1 flex-col gap-6">
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </section>
  );
}

/**
 * One concern on a Settings page: a form that adds, a table that lists, a
 * danger zone. `aria-label` makes it a landmark a test can find by name.
 */
export function SettingsSection({
  title,
  description,
  children,
  className,
  tone = "default",
  ...rest
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** `danger` for what suspends, revokes or archives. */
  tone?: "default" | "danger";
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <section
      {...rest}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4",
        tone === "danger" && "border-destructive/30",
        className,
      )}
    >
      {title || description ? (
        <div className="flex flex-col gap-0.5">
          {title ? <h2 className="text-sm font-medium">{title}</h2> : null}
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * One setting, as a row: what it is and a line on why, then the control that
 * changes it. Rows sit in a plain column and rule against one another, so a
 * tenth setting is a tenth row rather than a tenth card — a page of cards each
 * holding a single field spends more frame than it frames (Matt, 2026-09-07).
 * Stacked until the column is wide enough to put the control beside the label.
 */
export function SettingsRow({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  /** Names the control this row is about, so the label is the control's label. */
  htmlFor?: string;
  children: ReactNode;
}) {
  const name = <span className="text-sm font-medium">{label}</span>;
  return (
    <div className="grid items-start gap-x-6 gap-y-3 border-t py-3.5 last:border-b @lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex min-w-0 flex-col gap-0.5">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="w-fit cursor-pointer">
            {name}
          </label>
        ) : (
          name
        )}
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="flex min-w-0 flex-col items-start gap-2 @lg:items-end">{children}</div>
    </div>
  );
}
