import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { DataTable, type DataColumn } from "@/components/data-table";
import { MemberChip } from "@/components/member-chip";
import { SettingsPage } from "@/components/settings-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeEvent } from "@/lib/event-text";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE = 100;
/** Base UI's Select wants a value for "everything"; the empty string is not one. */
const ANY = "__any";

/** The Event kinds by what they are about, so the filter reads as the log does. */
const kindFamilies = [
  { label: "Issues", prefixes: ["issue", "gate", "document", "comment"] },
  { label: "Runs", prefixes: ["run"] },
  { label: "Workspace", prefixes: ["member", "agent", "project", "workspace"] },
];
const subjectFamilies = [
  { label: "Work", types: ["issue", "run", "project"] },
  { label: "Workspace", types: ["member", "team", "label", "channel", "webhook", "workspace"] },
];

interface EventRow {
  seq: number;
  kind: string;
  actorMemberId: string | null;
  subjectType: string;
  subjectId: string;
  projectId: string | null;
  payload: unknown;
  createdAt: string | Date;
}

/** The hue a kind's family carries elsewhere in the UI: Gates amber, Runs the Agent's. */
function kindClass(kind: string): string {
  if (kind.startsWith("gate.")) return "border-gate/50 text-gate-foreground dark:text-gate";
  if (kind.startsWith("run.")) return "border-agent/50 text-agent";
  if (kind.startsWith("member.") || kind.startsWith("agent.")) return "border-human/50 text-human";
  return "";
}

/**
 * The Workspace's Event log, newest first: the audit trail deevy's design
 * turns on, which until here could only be read with sqlite3
 * (docs/plans/ui-redesign.md slice 10). One `events.list` per page, paged
 * back with `before`; `useLiveEvents` re-reads it as Events arrive.
 */
export function EventLogPage() {
  const [kindPrefix, setKindPrefix] = useState(ANY);
  const [subjectType, setSubjectType] = useState(ANY);
  const [projectId, setProjectId] = useState(ANY);
  const [before, setBefore] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const events = useQuery(
    orpc.events.list.queryOptions({
      input: {
        order: "desc",
        limit: PAGE,
        ...(before === null ? {} : { before }),
        ...(subjectType !== ANY ? { subjectType } : {}),
        ...(projectId !== ANY ? { projectId } : {}),
      },
    }),
  );
  const members = useQuery(orpc.members.list.queryOptions({ input: {} }));
  const projects = useQuery(orpc.projects.list.queryOptions({ input: {} }));
  const labels = useQuery(orpc.labels.list.queryOptions({ input: {} }));
  const labelById = useMemo(
    () =>
      new Map(
        (labels.data?.labels ?? []).map((label) => [
          label.id,
          label.scope ? `${label.scope}: ${label.name}` : label.name,
        ]),
      ),
    [labels.data],
  );
  const memberById = useMemo(
    () => new Map((members.data?.members ?? []).map((member) => [member.id, member])),
    [members.data],
  );
  const projectById = useMemo(
    () => new Map((projects.data?.projects ?? []).map((project) => [project.id, project])),
    [projects.data],
  );

  const rows = useMemo(() => {
    const all = (events.data?.events ?? []) as EventRow[];
    return kindPrefix !== ANY
      ? all.filter((event) => event.kind.startsWith(`${kindPrefix}.`))
      : all;
  }, [events.data, kindPrefix]);

  const columns: DataColumn<EventRow>[] = [
    {
      id: "seq",
      header: "Seq",
      cell: (row) => <span className="font-mono text-xs text-muted-foreground">{row.seq}</span>,
      className: "w-16",
    },
    {
      id: "time",
      header: "When",
      cell: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {new Date(row.createdAt).toLocaleString()}
        </span>
      ),
      className: "w-44",
    },
    {
      id: "kind",
      header: "Kind",
      cell: (row) => (
        <Badge variant="outline" className={cn("font-mono font-normal", kindClass(row.kind))}>
          {row.kind}
        </Badge>
      ),
      className: "w-48",
    },
    {
      id: "actor",
      header: "Actor",
      cell: (row) => {
        const actor = row.actorMemberId ? memberById.get(row.actorMemberId) : undefined;
        return actor ? (
          <MemberChip member={actor} size="xs" />
        ) : (
          <span className="text-xs text-muted-foreground">deevy</span>
        );
      },
      className: "w-44",
    },
    {
      id: "what",
      header: "What",
      cell: (row) => {
        const actor = row.actorMemberId ? memberById.get(row.actorMemberId) : undefined;
        const said = describeEvent(
          { kind: row.kind, payload: row.payload, actorKind: actor?.kind ?? null },
          {
            memberName: (id) => memberById.get(id)?.user.name,
            labelName: (id) => labelById.get(id),
          },
        );
        if (!said) return <span className="text-xs text-muted-foreground">a Run step</span>;
        return (
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm">{said.text}</span>
            {said.detail ? (
              <span className="truncate text-xs text-muted-foreground">“{said.detail}”</span>
            ) : null}
          </span>
        );
      },
      className: "max-w-0 w-full",
    },
    {
      id: "subject",
      header: "Subject",
      cell: (row) => {
        const project = row.projectId ? projectById.get(row.projectId) : undefined;
        return (
          <span className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{row.subjectType}</span>
            {project ? <span className="font-mono">{project.key}</span> : null}
            {row.subjectType === "project" && project ? (
              <Link
                to="/projects/$key"
                params={{ key: project.key }}
                className="hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                {project.name}
              </Link>
            ) : null}
          </span>
        );
      },
      className: "w-56",
    },
  ];

  return (
    <SettingsPage
      title="Event log"
      description="Every change in this Workspace, newest first: who did what, to which Issue or Project, and when. The Activity, the live stream and the inbox all derive from this; a row opens its raw payload."
    >
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        <Select value={kindPrefix} onValueChange={(next) => next !== null && setKindPrefix(next)}>
          <SelectTrigger aria-label="Kind" className="w-44">
            <SelectValue>
              {(selected: string) => (selected === ANY ? "Every kind" : `${selected}.*`)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ANY}>Every kind</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            {kindFamilies.map((family) => (
              <SelectGroup key={family.label}>
                <SelectLabel>{family.label}</SelectLabel>
                {family.prefixes.map((prefix) => (
                  <SelectItem key={prefix} value={prefix}>
                    {prefix}.*
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={subjectType}
          onValueChange={(next) => {
            if (next === null) return;
            setSubjectType(next);
            setBefore(null);
          }}
        >
          <SelectTrigger aria-label="Subject" className="w-40">
            <SelectValue>
              {(selected: string) => (selected === ANY ? "Any subject" : selected)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ANY}>Any subject</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            {subjectFamilies.map((family) => (
              <SelectGroup key={family.label}>
                <SelectLabel>{family.label}</SelectLabel>
                {family.types.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={projectId}
          onValueChange={(next) => {
            if (next === null) return;
            setProjectId(next);
            setBefore(null);
          }}
        >
          <SelectTrigger aria-label="Project" className="w-48">
            <SelectValue>
              {(selected: string) => {
                if (selected === ANY) return "All Projects";
                const project = projectById.get(selected);
                return project ? `${project.key} — ${project.name}` : selected;
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ANY}>All Projects</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              {(projects.data?.projects ?? []).map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.key} — {project.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className="flex-1" />
        {before !== null ? (
          <Button variant="ghost" size="sm" onClick={() => setBefore(null)}>
            Newest
          </Button>
        ) : null}
      </div>

      {events.isError ? (
        <p className="text-sm text-destructive">Could not load the log: {events.error.message}</p>
      ) : (
        <DataTable
          aria-label="Event log"
          columns={columns}
          rows={rows}
          getRowId={(row) => String(row.seq)}
          selectedId={open === null ? null : String(open)}
          onOpen={(id) => setOpen((current) => (current === Number(id) ? null : Number(id)))}
          loading={events.isPending}
          empty={{
            title: "Nothing yet",
            description: "The first Event lands when anything happens.",
          }}
        />
      )}

      {open !== null ? (
        <pre
          aria-label={`Payload of ${String(open)}`}
          className="overflow-x-auto rounded-md border bg-muted p-3 font-mono text-xs"
        >
          {JSON.stringify(rows.find((row) => row.seq === open)?.payload ?? null, null, 2)}
        </pre>
      ) : null}

      {events.data && events.data.events.length === PAGE && events.data.nextCursor !== null ? (
        <div>
          <Button variant="outline" size="sm" onClick={() => setBefore(events.data.nextCursor)}>
            Older
          </Button>
        </div>
      ) : null}
    </SettingsPage>
  );
}
