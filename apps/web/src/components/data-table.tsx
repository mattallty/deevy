import { ArrowDown, ArrowUp, ChevronRight, type LucideIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface DataColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Given, the column sorts on click by this value. */
  sortValue?: (row: T) => SortValue;
  className?: string;
  headerClassName?: string;
}

export interface DataGroup<T> {
  id: string;
  header: ReactNode;
  rows: T[];
  collapsed?: boolean;
  onToggle?: () => void;
}

export interface DataTableProps<T> {
  columns: DataColumn<T>[];
  /** Flat rows, or groups of them with a header row between. */
  rows?: T[];
  groups?: DataGroup<T>[];
  getRowId: (row: T) => string;
  /** The row the keyboard is on; the page owns it (lib/shortcuts.ts). */
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** A click or Enter on a row. */
  onOpen?: (id: string) => void;
  loading?: boolean;
  /** What to say when there are no rows; the icon says what kind of thing is missing. */
  empty?: { title: ReactNode; description?: ReactNode; icon?: LucideIcon; action?: ReactNode };
  density?: "compact" | "comfortable";
  className?: string;
  "aria-label"?: string;
}

type Direction = "asc" | "desc";

type SortValue = string | number | null | undefined;

function compare(a: SortValue, b: SortValue): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const left = typeof a === "string" ? a : a.toString();
  const right = typeof b === "string" ? b : b.toString();
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * The list every screen with a list is built on: a plain table with a sticky
 * header, columns that sort when asked, group rows that fold, a skeleton while
 * loading and an Empty when there is nothing. It renders `role="table"` and a
 * row's accessible name is its text, so a test that looks for a row by what it
 * says keeps working (docs/plans/ui-redesign.md, .claude/skills/deevy-ui).
 */
export function DataTable<T>({
  columns,
  rows,
  groups,
  getRowId,
  selectedId,
  onSelect,
  onOpen,
  loading = false,
  empty,
  density = "compact",
  className,
  "aria-label": label,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ id: string; direction: Direction } | null>(null);

  const sorted = useMemo(() => {
    const sorter = sort ? columns.find((column) => column.id === sort.id)?.sortValue : undefined;
    const order = (list: T[]) => {
      if (!sorter) return list;
      const sign = sort?.direction === "desc" ? -1 : 1;
      return [...list].sort((a, b) => sign * compare(sorter(a), sorter(b)));
    };
    if (groups) return groups.map((group) => ({ ...group, rows: order(group.rows) }));
    return [{ id: "all", header: null, rows: order(rows ?? []) } satisfies DataGroup<T>];
  }, [columns, groups, rows, sort]);

  const total = sorted.reduce((count, group) => count + group.rows.length, 0);
  const rowClass = cn(
    "cursor-default",
    density === "compact" ? "[&>td]:py-1.5 h-8" : "[&>td]:py-2.5 h-10",
  );

  if (loading) {
    return (
      <div className={cn("flex flex-col gap-2 py-3", className)} aria-busy="true">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-7 w-full" />
        ))}
      </div>
    );
  }

  if (total === 0 && empty) {
    return (
      <Empty className={className}>
        <EmptyHeader>
          {empty.icon ? (
            <EmptyMedia variant="icon">
              <empty.icon aria-hidden />
            </EmptyMedia>
          ) : null}
          <EmptyTitle>{empty.title}</EmptyTitle>
          {empty.description ? <EmptyDescription>{empty.description}</EmptyDescription> : null}
        </EmptyHeader>
        {empty.action ? <EmptyContent>{empty.action}</EmptyContent> : null}
      </Empty>
    );
  }

  return (
    <Table aria-label={label} className={className}>
      <TableHeader className="sticky top-0 z-10 bg-background">
        <TableRow className="hover:bg-transparent">
          {columns.map((column) => {
            const active = sort?.id === column.id;
            return (
              <TableHead key={column.id} className={cn("h-9 text-xs", column.headerClassName)}>
                {column.sortValue ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    aria-sort={
                      active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"
                    }
                    onClick={() =>
                      setSort(
                        active && sort.direction === "asc"
                          ? { id: column.id, direction: "desc" }
                          : active
                            ? null
                            : { id: column.id, direction: "asc" },
                      )
                    }
                  >
                    {column.header}
                    {active ? (
                      sort.direction === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )
                    ) : null}
                  </button>
                ) : (
                  column.header
                )}
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((group) => (
          <GroupRows
            key={group.id}
            group={group}
            columns={columns}
            getRowId={getRowId}
            selectedId={selectedId}
            onSelect={onSelect}
            onOpen={onOpen}
            rowClass={rowClass}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function GroupRows<T>({
  group,
  columns,
  getRowId,
  selectedId,
  onSelect,
  onOpen,
  rowClass,
}: {
  group: DataGroup<T>;
  columns: DataColumn<T>[];
  getRowId: (row: T) => string;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onOpen?: (id: string) => void;
  rowClass: string;
}) {
  return (
    <>
      {group.header ? (
        <TableRow
          data-slot="group-row"
          className="bg-muted/40 hover:bg-muted/60"
          onClick={group.onToggle}
        >
          <TableCell colSpan={columns.length} className="h-8 py-1 text-xs font-medium">
            <span className="inline-flex items-center gap-2">
              {group.onToggle ? (
                <ChevronRight
                  className={cn(
                    "size-3.5 text-muted-foreground transition-transform",
                    !group.collapsed && "rotate-90",
                  )}
                  aria-hidden
                />
              ) : null}
              {group.header}
              <span className="font-mono text-muted-foreground">{group.rows.length}</span>
            </span>
          </TableCell>
        </TableRow>
      ) : null}
      {group.collapsed
        ? null
        : group.rows.map((row) => {
            const id = getRowId(row);
            const selected = id === selectedId;
            return (
              <TableRow
                key={id}
                data-row-id={id}
                data-selected={selected ? "true" : undefined}
                aria-selected={selected}
                className={cn(rowClass, selected && "bg-accent hover:bg-accent")}
                onMouseEnter={() => onSelect?.(id)}
                onClick={() => onOpen?.(id)}
              >
                {columns.map((column) => (
                  <TableCell key={column.id} className={column.className}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
    </>
  );
}
