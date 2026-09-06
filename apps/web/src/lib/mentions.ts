import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Mentionable } from "@/components/tiptap-editor";
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
