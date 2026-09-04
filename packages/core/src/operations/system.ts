import { z } from "zod";
import { MemberSchema, UserSchema, WorkspaceSchema } from "../schemas.ts";
import { NoInput, defineOperation } from "./registry.ts";

export const health = {
  ping: defineOperation({
    name: "health.ping",
    summary: "Liveness check",
    method: "GET",
    path: "/health/ping",
    auth: "public",
    input: NoInput,
    output: z.object({ ok: z.literal(true), time: z.string() }),
    handler: async () => ({ ok: true as const, time: new Date().toISOString() }),
  }),
};

export const me = {
  get: defineOperation({
    name: "me.get",
    summary: "The signed-in Human, their Member row, and the Workspace",
    method: "GET",
    path: "/me",
    auth: "session",
    input: NoInput,
    output: z.object({
      user: UserSchema,
      member: MemberSchema.nullable(),
      workspace: WorkspaceSchema.nullable(),
    }),
    handler: async ({ context }) => ({
      user: {
        id: context.session.user.id,
        name: context.session.user.name,
        email: context.session.user.email,
        image: context.session.user.image ?? null,
        kind: context.session.user.kind ?? "human",
      },
      member: context.member,
      workspace: context.workspace,
    }),
  }),
};
