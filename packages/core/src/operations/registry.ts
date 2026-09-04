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

export type AuthRule = "public" | "session" | "member" | "admin";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface AppContext {
  db: Db;
  session: Session | null;
  member: Member | null;
  workspace: Workspace | null;
  /**
   * The Projects an Agent principal may see, resolved once per request. `null`
   * means every Project: a Human is not scoped in v1 (docs/plans/m2.md).
   */
  grantedProjectIds?: string[] | null;
}

export type ContextFor<TAuth extends AuthRule> = TAuth extends "member" | "admin"
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
  /**
   * An Agent Member may call this operation, scoped to its granted Projects
   * (ADR-0004). Default-deny: omitted means Humans only, so an operation added
   * later is refused to Agents until someone decides otherwise. Only sayable on
   * a `member` operation, which is how ADR-0004's "never administer" becomes a
   * compile error rather than a test.
   */
  agents?: true;
}

/** `agents` is unsayable on anything but a `member` operation (ADR-0004). */
export type AgentAccess<TAuth extends AuthRule> = TAuth extends "member"
  ? { agents?: true }
  : { agents?: never };

/**
 * A streaming operation: the same shape, but its handler returns an async
 * iterator and its output is an oRPC event iterator. The SSE stream is the
 * third surface of ADR-0005, so it stays inside the registry like the rest
 * (ADR-0009).
 */
export type StreamOperationDef<TAuth extends AuthRule, TInput extends AnySchema> = OperationMeta &
  AgentAccess<TAuth> & {
    auth: TAuth;
    input: TInput;
    output: AnySchema;
    handler: (args: {
      input: InferSchemaOutput<TInput>;
      context: ContextFor<TAuth>;
      signal?: AbortSignal;
    }) => AsyncGenerator<unknown, void, unknown>;
  };

export type OperationDef<
  TAuth extends AuthRule,
  TInput extends AnySchema,
  TOutput extends AnySchema,
> = OperationMeta &
  AgentAccess<TAuth> & {
    auth: TAuth;
    input: TInput;
    output: TOutput;
    handler: (args: {
      input: InferSchemaOutput<TInput>;
      context: ContextFor<TAuth>;
    }) => Promise<InferSchemaInput<TOutput>>;
  };

/** Input for operations that take nothing: the RPC link sends undefined, the OpenAPI handler an empty object (GET inputs must be objects). */
export const NoInput = z.object({}).optional();

export const [operationMeta, getOperationMeta] = defineMeta(
  "deevy",
  (incoming: OperationMeta) => incoming,
);

export const base = os.$context<AppContext>();

function authorize(meta: OperationMeta) {
  const rule = meta.auth;
  return base.middleware(async ({ context, next }) => {
    if (rule === "public") return next();
    if (!context.session) throw new ORPCError("UNAUTHORIZED");
    if (rule === "session") return next();
    // A suspended Member keeps their row so the SPA can say why, but is no
    // Member as far as the Workspace is concerned (docs/plans/m1.md).
    if (!context.member || !context.workspace || context.member.suspendedAt) {
      throw new ORPCError("FORBIDDEN", { message: "Not a Member of this Workspace" });
    }
    if (rule === "admin" && context.member.role !== "admin") {
      throw new ORPCError("FORBIDDEN", { message: "Only an admin of this Workspace can do that" });
    }
    if (context.member.kind === "agent" && !meta.agents) {
      throw new ORPCError("FORBIDDEN", { message: "An Agent cannot do that" });
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
    ...(def.agents ? { agents: def.agents } : {}),
  };
  return base
    .use(authorize(meta))
    .meta(operationMeta(meta))
    .meta(
      openapi({ method: def.method, path: def.path, operationId: def.name, summary: def.summary }),
    )
    .input(def.input)
    .output(def.output)
    .handler(({ input, context }) => def.handler({ input, context: context as ContextFor<TAuth> }));
}

/**
 * The streaming counterpart of defineOperation. Everything but the handler's
 * shape is the same, so an event stream carries the same auth rule, meta and
 * OpenAPI entry as any other operation.
 */
export function defineStreamOperation<TAuth extends AuthRule, TInput extends z.ZodType>(
  def: StreamOperationDef<TAuth, TInput>,
) {
  const meta: OperationMeta = {
    name: def.name,
    summary: def.summary,
    method: def.method,
    path: def.path,
    auth: def.auth,
    ...(def.agents ? { agents: def.agents } : {}),
  };
  return base
    .use(authorize(meta))
    .meta(operationMeta(meta))
    .meta(
      openapi({ method: def.method, path: def.path, operationId: def.name, summary: def.summary }),
    )
    .input(def.input)
    .output(def.output)
    .handler(({ input, context, signal }) =>
      def.handler({ input, context: context as ContextFor<TAuth>, signal }),
    );
}
