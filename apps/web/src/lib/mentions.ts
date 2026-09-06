import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ChipMember } from "@/components/member-chip";
import type { Mentionable } from "@/components/tiptap-editor";
import type { EventContext } from "@/lib/event-text";
import { labelText } from "@/lib/labels";
import { orpc } from "@/lib/orpc";

/**
 * Who a `@` may name in this Workspace: every Member and every Team, by handle
 * (packages/core/src/mentions.ts resolves the same set). Read once and shared
 * through the query cache, so an editor costs no request of its own.
 */
export function useMentionables(): Mentionable[] {
  const members = useQuery(orpc.members.list.queryOptions({ input: {} }));
  const teams = useQuery(orpc.teams.list.queryOptions({ input: {} }));
  return useMemo(() => {
    const people: Mentionable[] = (members.data?.members ?? [])
      .filter((member) => member.handle && !member.suspendedAt)
      .map((member) => ({
        handle: member.handle ?? "",
        name: member.user.name,
        kind: member.kind,
      }));
    const groups: Mentionable[] = (teams.data?.teams ?? [])
      .filter((team) => team.handle)
      .map((team) => ({ handle: team.handle ?? "", name: team.name, kind: "team" as const }));
    return [...people, ...groups];
  }, [members.data, teams.data]);
}

/** Every Member of the Workspace by id, from the one cached `members.list`, for a screen that has ids. */
export function useMembersById(): Map<string, ChipMember & { sponsorId: string | null }> {
  const members = useQuery(orpc.members.list.queryOptions({ input: {} }));
  return useMemo(
    () => new Map((members.data?.members ?? []).map((member) => [member.id, member])),
    [members.data],
  );
}

/**
 * What `describeEvent` needs to name what an older payload only numbers: a
 * Member or a Label by id. New Events carry the names themselves
 * (lib/event-text.ts), so this is the fallback the Activity and the Event log
 * share rather than each build.
 */
export function useEventContext(): EventContext {
  const memberById = useMembersById();
  const labels = useQuery(orpc.labels.list.queryOptions({ input: {} }));
  return useMemo(() => {
    const labelById = new Map(
      (labels.data?.labels ?? []).map((label) => [label.id, labelText(label)]),
    );
    return {
      memberName: (id) => memberById.get(id)?.user.name,
      labelName: (id) => labelById.get(id),
    };
  }, [memberById, labels.data]);
}
