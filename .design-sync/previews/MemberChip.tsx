import { MemberChip } from "@deevy/design-system";
import { ada, builder, grace, planner, suspendedAgent } from "./lib/fixtures";

/** A Human is a round avatar ringed in sky; an Agent a square one ringed in rose. */
export const HumanAndAgent = () => (
  <div className="flex flex-wrap items-center gap-6">
    <MemberChip member={ada} />
    <MemberChip member={planner} sponsorName="Ada Lovelace" />
  </div>
);

export const Sizes = () => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center gap-6">
      <MemberChip member={grace} size="xs" />
      <MemberChip member={grace} size="sm" />
      <MemberChip member={grace} size="md" />
      <MemberChip member={grace} size="lg" />
    </div>
    <div className="flex items-center gap-6">
      <MemberChip member={builder} size="xs" />
      <MemberChip member={builder} size="sm" />
      <MemberChip member={builder} size="md" />
      <MemberChip member={builder} size="lg" />
    </div>
  </div>
);

/** The handle in mono where a name alone is ambiguous. */
export const WithHandle = () => (
  <div className="flex flex-wrap items-center gap-6">
    <MemberChip member={ada} showHandle />
    <MemberChip member={planner} showHandle />
  </div>
);

/** A suspended Member is dimmed; the avatar alone is for the folded sidebar. */
export const SuspendedAndAvatarOnly = () => (
  <div className="flex flex-wrap items-center gap-6">
    <MemberChip member={suspendedAgent} />
    <MemberChip member={ada} avatarOnly size="md" />
    <MemberChip member={builder} avatarOnly size="md" />
  </div>
);
