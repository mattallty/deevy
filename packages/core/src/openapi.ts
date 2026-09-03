import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { router } from "./operations/index.ts";

const generator = new OpenAPIGenerator({ converters: [new ZodToJsonSchemaConverter()] });

/** The OpenAPI 3.1 document for the HTTP surface, served at /api/spec.json and snapshotted in CI (ADR-0009). */
export function generateSpec() {
  return generator.generate(router, {
    base: {
      info: { title: "deevy", version: "0.0.0" },
      servers: [{ url: "/api" }],
    },
  });
}
