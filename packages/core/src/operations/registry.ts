import type { Db, Member, Workspace } from "@deevy/db";
import type { AnySchema, InferSchemaInput, InferSchemaOutput } from "@orpc/contract";
import { openapi } from "@orpc/openapi";
import { defineMeta, ORPCError, os } from "@orpc/server";
import { z } from "zod";
import type { Session } from "../auth.ts";

/**
 * The operation registry (ADR-0009). Every API operation is described by this
 * shape and projected to HTTP, OpenAPI, the typed client, and (M2) MCP tools.
 * oRPC is the implementation behind it; nothing outside this file builds
 * procedures directly, so a forced exit costs adapters, not the domain.
 */

export type AuthRule = "public" | "session" | "member";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface AppContext {
  db: Db;
  session: Session | null;
  member: Member | null;
  workspace: Workspace | null;
}

export type ContextFor<TAuth extends AuthRule> = TAuth extends "member"
  ? AppContext & { session: Session; member: Member; workspace: Workspace }
  : TAuth extends "session"
    ? AppContext & { session: Session }
    : AppContext;

export interface OperationMeta {
  /** Dotted, stable identifier: also the OpenAPI operationId and the MCP tool name. */
  name: string;
  summary: string;
  method: HttpMethod;
  path: `/${string}`;
  auth: AuthRule;
}

export interface OperationDef<
  TAuth extends AuthRule,
  TInput extends AnySchema,
  TOutput extends AnySchema,
> extends OperationMeta {
  auth: TAuth;
  input: TInput;
  output: TOutput;
  handler: (args: {
    input: InferSchemaOutput<TInput>;
    context: ContextFor<TAuth>;
  }) => Promise<InferSchemaInput<TOutput>>;
}

/** Input for operations that take nothing: the RPC link sends undefined, the OpenAPI handler an empty object. */
export const NoInput = z.object({}).optional();

export const [operationMeta, getOperationMeta] = defineMeta(
  "deevy",
  (incoming: OperationMeta) => incoming,
);

export const base = os.$context<AppContext>();

function authorize(rule: AuthRule) {
  return base.middleware(async ({ context, next }) => {
    if (rule === "public") return next();
    if (!context.session) throw new ORPCError("UNAUTHORIZED");
    if (rule === "member" && (!context.member || !context.workspace)) {
      throw new ORPCError("FORBIDDEN", { message: "Not a Member of this Workspace" });
    }
    return next();
  });
}

export function defineOperation<
  TAuth extends AuthRule,
  TInput extends z.ZodType,
  TOutput extends z.ZodType,
>(def: OperationDef<TAuth, TInput, TOutput>) {
  const meta: OperationMeta = {
    name: def.name,
    summary: def.summary,
    method: def.method,
    path: def.path,
    auth: def.auth,
  };
  return base
    .use(authorize(def.auth))
    .meta(operationMeta(meta))
    .meta(
      openapi({ method: def.method, path: def.path, operationId: def.name, summary: def.summary }),
    )
    .input(def.input)
    .output(def.output)
    .handler(({ input, context }) => def.handler({ input, context: context as ContextFor<TAuth> }));
}
