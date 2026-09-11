import { Bot } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** The least a chip needs to know: what `members.list` and `me.get` both carry. */
export interface ChipMember {
  id: string;
  kind: "human" | "agent";
  handle?: string | null;
  suspendedAt?: Date | string | null;
  user: { name: string; image?: string | null };
}

const sizes = {
  /**
   * For a chip inside a sentence — who did a thing, in the Activity stream.
   * The avatar is the height of the line it sits on rather than taller than
   * it, and the name is the size of the words either side of it, so the row
   * reads as one sentence with a mark in it.
   */
  inline: { avatar: "size-3.5 text-[8px]", text: "text-sm", gap: "gap-1.5" },
  xs: { avatar: "size-4 text-[9px]", text: "text-xs", gap: "gap-1.5" },
  sm: { avatar: "size-5 text-[10px]", text: "text-sm", gap: "gap-2" },
  md: { avatar: "size-7 text-xs", text: "text-sm", gap: "gap-2" },
  lg: { avatar: "size-10 text-sm", text: "text-base", gap: "gap-3" },
} as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * A Member, drawn so nobody has to read to know which kind it is: a Human is a
 * round avatar ringed in copper, an Agent a square one ringed in teal with a
 * bot glyph when it has no picture (ADR-0001, .claude/skills/deevy-ui). Its
 * text is the name, so a test that looks for "Ada Lovelace" still finds it.
 */
export function MemberChip({
  member,
  size = "sm",
  showHandle = false,
  sponsorName,
  className,
  avatarOnly = false,
}: {
  member: ChipMember;
  size?: keyof typeof sizes;
  /** The @handle in mono after the name, where the name alone is ambiguous. */
  showHandle?: boolean;
  /** The Human accountable for this Agent, for the tooltip. */
  sponsorName?: string | null;
  className?: string;
  /** Only the avatar, where there is no room for a name: the folded sidebar. */
  avatarOnly?: boolean;
}) {
  const agent = member.kind === "agent";
  const suspended = Boolean(member.suspendedAt);
  const style = sizes[size];
  const title = agent
    ? `Agent${sponsorName ? `, sponsored by ${sponsorName}` : ""}${suspended ? ", suspended" : ""}`
    : `Human${suspended ? ", suspended" : ""}`;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            data-slot="member-chip"
            data-kind={member.kind}
            className={cn(
              "inline-flex min-w-0 items-center",
              style.gap,
              suspended && "opacity-60 saturate-50",
              className,
            )}
          />
        }
      >
        <Avatar
          className={cn(
            style.avatar,
            "shrink-0 ring-1 ring-offset-1 ring-offset-background",
            agent ? "rounded-sm ring-agent" : "rounded-full ring-human",
          )}
        >
          {member.user.image ? <AvatarImage src={member.user.image} alt="" /> : null}
          <AvatarFallback
            className={cn(
              "font-medium",
              agent ? "rounded-sm bg-agent/15 text-agent" : "rounded-full bg-human/15 text-human",
            )}
          >
            {agent && !member.user.image ? <Bot className="size-[60%]" aria-hidden /> : null}
            {agent && !member.user.image ? (
              <span className="sr-only">{initials(member.user.name)}</span>
            ) : (
              initials(member.user.name)
            )}
          </AvatarFallback>
        </Avatar>
        {avatarOnly ? null : <span className={cn("truncate", style.text)}>{member.user.name}</span>}
        {showHandle && member.handle ? (
          <span className={cn("truncate font-mono text-muted-foreground", style.text)}>
            @{member.handle}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent>{avatarOnly ? `${member.user.name} · ${title}` : title}</TooltipContent>
    </Tooltip>
  );
}
